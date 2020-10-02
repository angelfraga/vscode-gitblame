import {
    blankCommitInfo,
    CommitAuthor,
    CommitInfo,
} from "./blanks";
import { split } from "../../util/split";

export type BlamedCommit = {
    readonly info: CommitInfo;
}

export type BlamedLine = {
    readonly line: number;
    readonly hash: string;
}

export type ChunkyGenerator = Generator<BlamedCommit> | Generator<BlamedLine>;

function * splitChunk(
    chunk: string,
): Generator<[string, string, string | undefined]> {
    const lines = chunk.split("\n");

    for (let index = 0; index < chunk.length; index++) {
        if (lines[index]) {
            const [key, value] = split(lines[index]);
            yield [key, value, lines[index + 1]];
        }
    }
}

function fillOwner(
    owner: CommitAuthor,
    dataPoint: string,
    value: string,
): void {
    if (dataPoint === "time") {
        owner.timestamp = parseInt(value, 10);
    } else if (dataPoint === "tz" || dataPoint === "mail") {
        owner[dataPoint] = value;
    } else if (dataPoint === "") {
        owner.name = value;
    }
}

function processAuthorLine(
    key: string,
    value: string,
    commitInfo: CommitInfo,
): void {
    const [author, dataPoint] = split(key, "-");

    if (author === "author") {
        fillOwner(commitInfo.author, dataPoint, value);
    } else if (author === "committer") {
        fillOwner(commitInfo.committer, dataPoint, value);
    }
}

function * lineGroupToIndividualLines(
    hash: string,
    lines: number,
    finalLine: number,
): Generator<BlamedLine> {
    for (let i = 0; i < lines; i++) {
        yield {
            line: finalLine + i,
            hash,
        };
    }
}

function * commitDeduplicator(
    commitInfo: CommitInfo,
    emittedCommits: Set<string>,
): Generator<BlamedCommit> {
    if (commitInfo.hash !== undefined && !emittedCommits.has(commitInfo.hash)) {
        emittedCommits.add(commitInfo.hash);

        yield {
            info: commitInfo,
        };
    }
}

function isHash(hash: string): boolean {
    return /^[a-z0-9]{40}$/.test(hash);
}

function newCommit(
    hash: string,
    nextLine?: string,
): boolean {
    if (nextLine === undefined) {
        return false;
    }

    return isHash(hash) && /^(author|committer)/.test(nextLine);
}

function * processLine(
    hashOrKey: string,
    value: string,
    commitInfo: CommitInfo,
): Generator<BlamedLine> {
    if (hashOrKey === "summary") {
        commitInfo.summary = value;
    } else if (isHash(hashOrKey)) {
        commitInfo.hash = hashOrKey;

        const [, finalLine, lines] = value.split(" ").map(Number);

        yield* lineGroupToIndividualLines(
            hashOrKey,
            lines,
            finalLine,
        );
    } else {
        processAuthorLine(hashOrKey, value, commitInfo);
    }
}

export function * processChunk(
    dataChunk: string,
    emittedCommits: Set<string>,
): Generator<ChunkyGenerator> {
    let commitInfo = blankCommitInfo();

    for (const [key, value, nextLine] of splitChunk(dataChunk)) {
        if (newCommit(key, nextLine)) {
            yield commitDeduplicator(commitInfo, emittedCommits);
            commitInfo = blankCommitInfo();
        }

        yield processLine(key, value, commitInfo);
    }

    yield commitDeduplicator(commitInfo, emittedCommits);
}
