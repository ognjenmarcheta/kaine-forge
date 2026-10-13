import { createHash } from "node:crypto";
import { chmod, readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createExec } from "../ports";
import { diffAgainstBase } from "./git.diff";
import { createGitPort } from "./git.real";
import { createScratch, hermeticExec, type TestRepo, type TestScratch } from "../testing/git.repo";

vi.setConfig({ testTimeout: 30_000 });

let scratch: TestScratch;
let repo: TestRepo;
let base: string;

const diff = () => diffAgainstBase(hermeticExec, repo.dir, base);

beforeEach(async () => {
  scratch = await createScratch();
  repo = await scratch.repo("repo");
  await repo.write("keep.txt", "keep\n");
  await repo.write("gone.txt", "gone\n");
  await repo.write(
    "moved.txt",
    "a line that is long enough to be detected as the same file\n".repeat(10)
  );
  await repo.write("edit.txt", "one\n");
  await repo.write(".gitignore", "ignored.log\nbuild/\n");
  base = await repo.commit("base");
});

afterEach(async () => {
  await scratch.cleanup();
});

describe("diffAgainstBase", () => {
  it("returns an empty diff with a stable hash when nothing changed", async () => {
    const result = await diff();
    expect(result.patch).toBe("");
    expect(result.files).toEqual([]);
    expect(result.diffHash).toBe(createHash("sha256").update("").digest("hex"));
  });

  it("covers modified, untracked and deleted files", async () => {
    await repo.write("edit.txt", "one\ntwo\n");
    await repo.write("src/new.ts", "export const x = 1;\n");
    await rm(path.join(repo.dir, "gone.txt"));
    const result = await diff();
    expect(result.files).toEqual(
      expect.arrayContaining([
        { path: "edit.txt", status: "modified" },
        { path: "src/new.ts", status: "added" },
        { path: "gone.txt", status: "deleted" }
      ])
    );
    expect(result.files).toHaveLength(3);
    expect(result.patch).toContain("+export const x = 1;");
    expect(result.patch).toContain("deleted file mode");
    expect(result.patch).toContain("+two");
  });

  it("includes changes that are already committed on top of the base", async () => {
    await repo.write("committed.txt", "c\n");
    await repo.commit("agent work");
    await repo.write("later.txt", "l\n");
    const result = await diff();
    expect(result.files.map((file) => file.path).sort()).toEqual(["committed.txt", "later.txt"]);
  });

  it("detects a rename and keeps the old path", async () => {
    await repo.git(["mv", "moved.txt", "renamed.txt"]);
    const result = await diff();
    expect(result.files).toEqual([
      { path: "renamed.txt", status: "renamed", oldPath: "moved.txt" }
    ]);
    expect(result.patch).toContain("rename from moved.txt");
  });

  it("detects a rename that was never staged", async () => {
    await rename(path.join(repo.dir, "moved.txt"), path.join(repo.dir, "renamed.txt"));
    const result = await diff();
    expect(result.files).toEqual([
      { path: "renamed.txt", status: "renamed", oldPath: "moved.txt" }
    ]);
  });

  it("carries a binary file in the patch so it can be applied", async () => {
    const bytes = Buffer.from([0, 1, 2, 255, 254, 0, 128, 0, 7, 9]);
    await repo.write("image.bin", bytes);
    const result = await diff();
    expect(result.files).toEqual([{ path: "image.bin", status: "added" }]);
    expect(result.patch).toContain("GIT binary patch");

    // Apply the patch to a clean checkout of the base: the bytes must match.
    const verify = await scratch.repo("verify");
    const patchFile = path.join(scratch.root, "change.patch");
    await writeFile(patchFile, result.patch);
    await verify.git(["apply", patchFile]);
    expect(await readFile(path.join(verify.dir, "image.bin"))).toEqual(bytes);
  });

  it("sees an edit of the same size made in the same second as the index was written", async () => {
    // Git trusts a stat entry only when it is older than the index file. Rebuild the "racy" case
    // on purpose: the entry, the edit, and the index all carry one whole-second time, and only
    // mtime and size count for git. Then the only way to see the edit is to compare the content.
    await repo.git(["config", "core.checkStat", "minimal"]);
    const second = new Date("2026-10-07T09:00:00Z");
    const file = path.join(repo.dir, "edit.txt");
    await utimes(file, second, second);
    await repo.git(["add", "edit.txt"]);
    const index = await repo.git(["rev-parse", "--path-format=absolute", "--git-path", "index"]);
    await utimes(index, second, second);

    await writeFile(file, "two\n");
    await utimes(file, second, second);

    const result = await diff();
    expect(result.files).toEqual([{ path: "edit.txt", status: "modified" }]);
    expect(result.patch).toContain("+two");
  });

  it("leaves gitignored files out", async () => {
    await repo.write("ignored.log", "noise\n");
    await repo.write("build/out.js", "noise\n");
    const result = await diff();
    expect(result.files).toEqual([]);
    expect(result.patch).toBe("");
  });

  it("gives the same hash on every call and a different one after a change", async () => {
    await repo.write("src/new.ts", "export const x = 1;\n");
    const first = await diff();
    const second = await diff();
    expect(second.diffHash).toBe(first.diffHash);
    expect(second.patch).toBe(first.patch);
    await repo.write("src/new.ts", "export const x = 2;\n");
    expect((await diff()).diffHash).not.toBe(first.diffHash);
  });

  it("does not change the real index, refs or working files", async () => {
    await repo.write("src/new.ts", "export const x = 1;\n");
    await repo.write("edit.txt", "one\ntwo\n");
    const before = {
      status: await repo.git(["status", "--porcelain=v1", "--untracked-files=all"]),
      staged: await repo.git(["diff", "--cached", "--name-only"]),
      index: await repo.git(["ls-files", "--stage"])
    };
    const snapshot = await createGitPort(hermeticExec).refsSnapshot(repo.dir);
    await diff();
    expect({
      status: await repo.git(["status", "--porcelain=v1", "--untracked-files=all"]),
      staged: await repo.git(["diff", "--cached", "--name-only"]),
      index: await repo.git(["ls-files", "--stage"])
    }).toEqual(before);
    expect(before.staged).toBe("");
    expect(await createGitPort(hermeticExec).refsSnapshot(repo.dir)).toEqual(snapshot);
  });

  it("does not stage anything for files the user staged by hand", async () => {
    await repo.write("a.txt", "a\n");
    await repo.git(["add", "a.txt"]);
    await repo.write("b.txt", "b\n");
    const result = await diff();
    expect(result.files.map((file) => file.path).sort()).toEqual(["a.txt", "b.txt"]);
    expect(await repo.git(["diff", "--cached", "--name-only"])).toBe("a.txt");
  });

  it("works inside a linked worktree", async () => {
    const dir = path.join(scratch.root, "wt");
    await createGitPort(hermeticExec).worktreeAdd(repo.dir, {
      branch: "KAINE-feat-wt",
      dir,
      base: "main"
    });
    await writeFile(path.join(dir, "wt-only.txt"), "w\n");
    const result = await diffAgainstBase(hermeticExec, dir, base);
    expect(result.files).toEqual([{ path: "wt-only.txt", status: "added" }]);
    expect(await repo.git(["status", "--porcelain=v1"], dir)).toBe("?? wt-only.txt");
  });

  it("records a mode change", async () => {
    await chmod(path.join(repo.dir, "keep.txt"), 0o755);
    const result = await diff();
    expect(result.files).toEqual([{ path: "keep.txt", status: "modified" }]);
    expect(result.patch).toContain("new mode 100755");
  });

  it("rejects a base that is not a full commit hash", async () => {
    await expect(diffAgainstBase(hermeticExec, repo.dir, "main")).rejects.toThrow(RangeError);
    await expect(diffAgainstBase(hermeticExec, repo.dir, "--output=x")).rejects.toThrow(RangeError);
  });

  it("fails when the capture limit cuts the patch", async () => {
    const tiny = createExec({ maxOutputBytes: 50 });
    await repo.write("big.txt", "x".repeat(2000));
    await expect(diffAgainstBase(tiny, repo.dir, base)).rejects.toThrow(/capture limit/);
  });
});
