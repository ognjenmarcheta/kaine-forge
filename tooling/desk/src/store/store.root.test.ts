import path from "node:path";
import { describe, expect, it } from "vitest";

import { configPath, resolveRepoLocation } from "./store.root";
import { fail, fakeExec, ok } from "../testing/exec.fake";

describe("resolveRepoLocation", () => {
  it("places state in the git common dir, resolving a relative path against cwd", async () => {
    const fake = fakeExec([
      { argv: ["git", "rev-parse", "--show-toplevel"], reply: ok("/work/repo\n") },
      { argv: ["git", "rev-parse", "--git-common-dir"], reply: ok(".git\n") }
    ]);
    await expect(resolveRepoLocation(fake.exec, "/work/repo")).resolves.toEqual({
      repoRoot: "/work/repo",
      gitCommonDir: "/work/repo/.git",
      stateRoot: "/work/repo/.git/kaine-desk"
    });
    expect(fake.calls.every((call) => call.cwd === "/work/repo")).toBe(true);
  });

  it("uses the shared common dir from a linked worktree", async () => {
    const fake = fakeExec([
      {
        argv: ["git", "rev-parse", "--show-toplevel"],
        reply: ok("/work/repo.worktrees/KAINE-7\n")
      },
      { argv: ["git", "rev-parse", "--git-common-dir"], reply: ok("/work/repo/.git\n") }
    ]);
    const location = await resolveRepoLocation(fake.exec, "/work/repo.worktrees/KAINE-7");
    expect(location.stateRoot).toBe("/work/repo/.git/kaine-desk");
    expect(location.repoRoot).toBe("/work/repo.worktrees/KAINE-7");
  });

  it("explains a directory that is not a git repository", async () => {
    const fake = fakeExec([{ argv: ["git"], reply: fail("fatal: not a git repository", 128) }]);
    await expect(resolveRepoLocation(fake.exec, "/tmp")).rejects.toThrow("not a git repository");
  });
});

describe("configPath", () => {
  it("points at the gitignored per-developer override", () => {
    expect(configPath("/work/repo")).toBe(
      path.join("/work/repo", ".ai.local", "desk", "config.json")
    );
  });
});
