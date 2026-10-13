import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitPort, RefsSnapshot } from "./git.port";
import { compareRefs, createGitPort, GitError } from "./git.real";
import { createScratch, hermeticExec, type TestRepo, type TestScratch } from "../testing/git.repo";

// Each test builds a real repository; give a loaded machine room.
vi.setConfig({ testTimeout: 30_000 });

let scratch: TestScratch;
let repo: TestRepo;
let git: GitPort;

beforeEach(async () => {
  scratch = await createScratch();
  repo = await scratch.repo("repo");
  git = createGitPort(hermeticExec);
});

afterEach(async () => {
  await scratch.cleanup();
});

describe("GitPort", () => {
  it("reads head, branch and status", async () => {
    const sha = await repo.git(["rev-parse", "HEAD"]);
    expect(await git.headSha(repo.dir)).toBe(sha);
    expect(await git.currentBranch(repo.dir)).toBe("main");
    expect(await git.statusPorcelain(repo.dir)).toBe("");
    await repo.write("dir/new.txt", "x");
    expect(await git.statusPorcelain(repo.dir)).toBe("?? dir/new.txt\n");
  });

  it("reports a detached HEAD as a null branch", async () => {
    await repo.git(["checkout", "--quiet", "--detach"]);
    expect(await git.currentBranch(repo.dir)).toBeNull();
  });

  it("checks branch names", async () => {
    expect(await git.checkRefFormat(repo.dir, "KAINE-1-feat-x")).toBe(true);
    expect(await git.checkRefFormat(repo.dir, "bad name")).toBe(false);
    expect(await git.checkRefFormat(repo.dir, "a..b")).toBe(false);
    expect(await git.checkRefFormat(repo.dir, "--evil")).toBe(false);
  });

  it("finds merge bases and ancestors", async () => {
    const base = await repo.git(["rev-parse", "HEAD"]);
    await repo.git(["checkout", "--quiet", "-b", "topic"]);
    await repo.write("a.txt", "a");
    await repo.commit("topic work");
    expect(await git.mergeBase(repo.dir, "main", "topic")).toBe(base);
    expect(await git.isAncestor(repo.dir, "main", "topic")).toBe(true);
    expect(await git.isAncestor(repo.dir, "topic", "main")).toBe(false);
    await repo.git(["checkout", "--quiet", "--orphan", "unrelated"]);
    await repo.write("b.txt", "b");
    await repo.commit("orphan");
    expect(await git.mergeBase(repo.dir, "main", "unrelated")).toBeNull();
  });

  it("renames a branch and tells whether one exists", async () => {
    await git.branchRename(repo.dir, "main", "KAINE-feat-renamed");
    expect(await git.currentBranch(repo.dir)).toBe("KAINE-feat-renamed");
    expect(await git.branchExists(repo.dir, "KAINE-feat-renamed")).toBe(true);
    expect(await git.branchExists(repo.dir, "main")).toBe(false);
  });

  it("adds, lists and removes a worktree and keeps the branch", async () => {
    const dir = `${scratch.root}/wt`;
    await git.worktreeAdd(repo.dir, { branch: "KAINE-feat-wt", dir, base: "main" });
    const listed = await git.worktreeList(repo.dir);
    expect(listed.map((entry) => entry.path)).toContain(dir);
    expect(listed.find((entry) => entry.path === dir)?.branch).toBe("KAINE-feat-wt");
    await git.worktreeRemove(repo.dir, dir, false);
    expect((await git.worktreeList(repo.dir)).map((entry) => entry.path)).not.toContain(dir);
    expect(await git.branchExists(repo.dir, "KAINE-feat-wt")).toBe(true);
    await git.worktreeAdd(repo.dir, {
      branch: "KAINE-feat-wt",
      dir,
      base: "main",
      existingBranch: true
    });
    expect(await git.currentBranch(dir)).toBe("KAINE-feat-wt");
  });

  it("throws GitError with the stderr tail when git fails", async () => {
    await expect(git.fetch(repo.dir, "nowhere", "main")).rejects.toBeInstanceOf(GitError);
    await expect(git.headSha(`${scratch.root}/missing`)).rejects.toBeInstanceOf(GitError);
  });

  it("never lets a value become a git option", async () => {
    await expect(
      git.worktreeAdd(repo.dir, { branch: "--orphan", dir: `${scratch.root}/x`, base: "main" })
    ).rejects.toThrow(RangeError);
    await expect(
      git.worktreeAdd(repo.dir, { branch: "b", dir: "relative", base: "main" })
    ).rejects.toThrow(RangeError);
    await expect(git.fetch(repo.dir, "--upload-pack=x", "main")).rejects.toThrow(RangeError);
  });
});

describe("refsSnapshot and compareRefs", () => {
  const snapshot = (): Promise<RefsSnapshot> => git.refsSnapshot(repo.dir);

  it("records head, branch, refs, remotes and stash", async () => {
    await repo.git(["remote", "add", "origin", "https://example.test/repo.git"]);
    await repo.git(["tag", "v1"]);
    const taken = await snapshot();
    expect(taken.head).toBe(await repo.git(["rev-parse", "HEAD"]));
    expect(taken.branch).toBe("main");
    expect(Object.keys(taken.refs).sort()).toEqual(["refs/heads/main", "refs/tags/v1"]);
    expect(taken.remotes["remote.origin.url"]).toBe("https://example.test/repo.git");
    expect(taken.stash).toEqual([]);
  });

  it("reports nothing when nothing changed, including untracked work", async () => {
    const before = await snapshot();
    await repo.write("work.txt", "uncommitted");
    await repo.git(["add", "work.txt"]);
    expect(compareRefs(before, await snapshot())).toEqual([]);
  });

  it("detects a new commit", async () => {
    const before = await snapshot();
    await repo.write("a.txt", "a");
    await repo.commit("agent commit");
    const kinds = compareRefs(before, await snapshot()).map((v) => [v.kind, v.subject]);
    expect(kinds).toContainEqual(["head-moved", "HEAD"]);
    expect(kinds).toContainEqual(["ref-moved", "refs/heads/main"]);
  });

  it("detects a commit made with the option forms a prefix deny rule misses", async () => {
    const before = await snapshot();
    await repo.write("a.txt", "a");
    await repo.git(["add", "a.txt"]);
    await repo.git(["-C", ".", "-c", "user.name=x", "commit", "--quiet", "-m", "sneaky"]);
    expect(compareRefs(before, await snapshot()).map((v) => v.kind)).toContain("head-moved");
  });

  it("detects a new branch, a new tag and a deleted tag", async () => {
    await repo.git(["tag", "old"]);
    const before = await snapshot();
    await repo.git(["branch", "side"]);
    await repo.git(["tag", "v2"]);
    await repo.git(["tag", "-d", "old"]);
    const violations = compareRefs(before, await snapshot());
    expect(violations).toContainEqual({
      kind: "ref-added",
      subject: "refs/heads/side",
      before: null,
      after: expect.any(String)
    });
    expect(violations).toContainEqual(
      expect.objectContaining({ kind: "ref-added", subject: "refs/tags/v2" })
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ kind: "ref-deleted", subject: "refs/tags/old", after: null })
    );
  });

  it("detects a moved tag", async () => {
    await repo.git(["tag", "t"]);
    const before = await snapshot();
    await repo.write("a.txt", "a");
    await repo.commit("next");
    await repo.git(["tag", "-f", "t"]);
    expect(
      compareRefs(before, await snapshot()).some(
        (v) => v.kind === "ref-moved" && v.subject === "refs/tags/t"
      )
    ).toBe(true);
  });

  it("detects a branch change", async () => {
    const before = await snapshot();
    await repo.git(["checkout", "--quiet", "-b", "other"]);
    const kinds = compareRefs(before, await snapshot()).map((v) => v.kind);
    expect(kinds).toContain("branch-changed");
    expect(kinds).toContain("ref-added");
    expect(kinds).not.toContain("head-moved");
  });

  it("detects a remote URL change, a new remote and a removed remote", async () => {
    await repo.git(["remote", "add", "origin", "https://example.test/a.git"]);
    const before = await snapshot();
    await repo.git(["remote", "set-url", "origin", "https://evil.test/a.git"]);
    await repo.git(["remote", "add", "extra", "https://example.test/b.git"]);
    const changed = compareRefs(before, await snapshot());
    expect(changed).toContainEqual({
      kind: "remote-changed",
      subject: "remote.origin.url",
      before: "https://example.test/a.git",
      after: "https://evil.test/a.git"
    });
    expect(changed.some((v) => v.subject === "remote.extra.url")).toBe(true);

    const withExtra = await snapshot();
    await repo.git(["remote", "remove", "extra"]);
    expect(
      compareRefs(withExtra, await snapshot()).some(
        (v) => v.kind === "remote-changed" && v.subject === "remote.extra.url" && v.after === null
      )
    ).toBe(true);
  });

  it("detects a stash entry", async () => {
    await repo.write("README.md", "changed\n");
    const before = await snapshot();
    await repo.git(["stash", "push", "--quiet"]);
    const kinds = compareRefs(before, await snapshot()).map((v) => v.kind);
    expect(kinds).toContain("stash-changed");
    expect(kinds).toContain("ref-added");
  });

  it("works in a linked worktree", async () => {
    const dir = `${scratch.root}/wt`;
    await git.worktreeAdd(repo.dir, { branch: "KAINE-feat-wt", dir, base: "main" });
    const before = await git.refsSnapshot(dir);
    expect(before.branch).toBe("KAINE-feat-wt");
    await repo.git(["tag", "from-linked"], dir);
    expect(compareRefs(before, await git.refsSnapshot(dir)).map((v) => v.subject)).toEqual([
      "refs/tags/from-linked"
    ]);
  });
});
