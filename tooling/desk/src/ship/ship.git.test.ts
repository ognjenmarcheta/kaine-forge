import { describe, expect, it } from "vitest";

import { looksLikeGitError, looksRejected, pushBranch, runGitSafely } from "./ship.git";
import { fakeExec, ok } from "../testing/exec.fake";

describe("looksRejected", () => {
  it.each([
    " ! [rejected]        main -> main (non-fast-forward)",
    " ! [remote rejected] b -> b (pre-receive hook declined)",
    "error: failed to push some refs\nhint: Updates were rejected because the tip is behind",
    "remote: error: GH006: Protected branch update failed (protected branch)",
    "remote: Permission to o/r.git denied to someone."
  ])("treats %j as a remote refusal", (log) => {
    expect(looksRejected(log)).toBe(true);
  });

  it("does not treat a local hook failure as a remote refusal", () => {
    expect(
      looksRejected("husky - pre-push script failed (code 1)\nerror: failed to push some refs")
    ).toBe(false);
  });
});

describe("looksLikeGitError", () => {
  it("recognises git's own errors and not a hook's output", () => {
    expect(looksLikeGitError("Author identity unknown\n*** Please tell me who you are.")).toBe(
      true
    );
    expect(looksLikeGitError("fatal: unable to auto-detect email address")).toBe(true);
    expect(looksLikeGitError("nothing to commit, working tree clean")).toBe(true);
    expect(looksLikeGitError("husky - pre-commit script failed (code 1)")).toBe(false);
    expect(looksLikeGitError("hook: pre-commit rejects")).toBe(false);
    expect(looksLikeGitError("")).toBe(false);
  });
});

describe("pushBranch", () => {
  it("runs a plain push with upstream tracking", async () => {
    const fake = fakeExec([{ argv: ["git"], reply: ok("") }]);
    await pushBranch(fake.exec, "/wt", "KAINE-7-feat-x", 1000);
    expect(fake.calls[0]?.argv).toEqual(["git", "push", "-u", "origin", "KAINE-7-feat-x"]);
  });

  it.each(["", "-f", "--force", "+main"])("refuses the branch %j", (branch) => {
    const fake = fakeExec([]);
    expect(() => pushBranch(fake.exec, "/wt", branch, 1000)).toThrow(RangeError);
    expect(fake.calls).toEqual([]);
  });
});

describe("runGitSafely", () => {
  it("never prompts and never waits for an editor", async () => {
    const fake = fakeExec([{ argv: ["git"], reply: ok("") }]);
    await runGitSafely(fake.exec, "/wt", ["status"]);
    expect(fake.calls[0]?.env).toMatchObject({
      GIT_TERMINAL_PROMPT: "0",
      GIT_EDITOR: "true",
      GIT_SEQUENCE_EDITOR: "true"
    });
  });

  it("reports a failure as a value with a bounded log", async () => {
    const fake = fakeExec([{ argv: ["git"], reply: { code: 1, stderr: "x\n".repeat(500) } }]);
    const outcome = await runGitSafely(fake.exec, "/wt", ["status"]);
    expect(outcome.ok).toBe(false);
    expect(outcome.log.split("\n").length).toBeLessThanOrEqual(120);
  });
});
