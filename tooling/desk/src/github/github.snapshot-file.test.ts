import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SnapshotFileError,
  createSnapshotGitHubPort,
  readSnapshotFile
} from "./github.snapshot-file";
import { snapshotOf } from "../testing/github.fake";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "desk-snapshot-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = async (content: string): Promise<string> => {
  const file = path.join(dir, "issue.json");
  await writeFile(file, content);
  return file;
};

describe("readSnapshotFile", () => {
  it("reads a valid snapshot", async () => {
    const snapshot = snapshotOf();
    expect(await readSnapshotFile(await write(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it.each([
    ["is missing", async () => path.join(dir, "none.json"), "Cannot read"],
    ["is not JSON", () => write("{nope"), "not valid JSON"],
    ["has a wrong shape", () => write(JSON.stringify({ number: 1 })), "issue snapshot format"],
    [
      "has an unknown key",
      () => write(JSON.stringify({ ...snapshotOf(), surprise: true })),
      "issue snapshot format"
    ]
  ])("rejects a file that %s", async (_name, make, text) => {
    const error = await readSnapshotFile(await make()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SnapshotFileError);
    expect(error instanceof Error && error.message).toContain(text);
  });
});

describe("createSnapshotGitHubPort", () => {
  it("serves the snapshot, signs in as the owner, and writes nothing", async () => {
    const snapshot = snapshotOf();
    const port = createSnapshotGitHubPort(snapshot, "me");
    expect(await port.fetchIssue(7)).toBe(snapshot);
    expect(await port.viewer()).toBe("me");
    expect(await port.repository()).toMatchObject({ ownerLogin: "me", ownerType: "User" });
    await expect(
      port.editLabels(7, { add: ["agent:working"], remove: [] })
    ).resolves.toBeUndefined();
    expect(await port.upsertStatusComment(7, "x")).toEqual({ action: "unchanged", commentId: 0 });
  });
});
