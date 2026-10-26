import { describe, expect, it } from "vitest";

import { isGitBranchName, isValidBranchName } from "./git.branch";

describe("the branch-name rule", () => {
  it.each([
    { name: "KAINE-feat-docs-only", git: true, desk: true },
    { name: "KAINE-7-docs-x", git: true, desk: true },
    { name: "main", git: true, desk: false },
    { name: "release/web", git: true, desk: false },
    { name: "kaine-7-feat-x", git: true, desk: false },
    { name: "KAINE-7-feature-x", git: true, desk: false },
    { name: "KAINE-7-feat-X", git: true, desk: false },
    { name: "claude/KAINE-7-feat-x", git: true, desk: false },
    { name: "KAINE-7-feat-", git: true, desk: false },
    { name: "main/../evil", git: false, desk: false },
    { name: "--upload-pack=x", git: false, desk: false },
    { name: "-f", git: false, desk: false },
    { name: "", git: false, desk: false }
  ])("'$name': a git branch $git, a desk branch $desk", ({ name, git, desk }) => {
    expect(isGitBranchName(name)).toBe(git);
    expect(isValidBranchName(name)).toBe(desk);
  });
});
