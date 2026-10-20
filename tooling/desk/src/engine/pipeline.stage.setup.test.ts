import path from "node:path";
import { describe, expect, it } from "vitest";

import { deskConfigSchema } from "../contracts";
import { worktreeDirFor } from "./pipeline.stage.setup";

const at = (repoRoot: string, gitCommonDir: string, worktreesDir: string | null = null) => ({
  config: deskConfigSchema.parse(worktreesDir === null ? {} : { worktreesDir }),
  location: { repoRoot, stateRoot: path.join(gitCommonDir, "kaine-desk") }
});

describe("worktreeDirFor", () => {
  it("puts issue worktrees next to the main checkout", () => {
    const repo = path.resolve("/src/repo");
    expect(worktreeDirFor(at(repo, path.join(repo, ".git")), 7)).toBe(
      path.resolve("/src/repo.worktrees/KAINE-7")
    );
  });

  it("does not nest them under a linked worktree, which makes Windows paths too long", () => {
    const repo = path.resolve("/src/repo");
    const linked = path.join(repo, ".claude", "worktrees", "session-1a2b3c");
    expect(worktreeDirFor(at(linked, path.join(repo, ".git")), 7)).toBe(
      path.resolve("/src/repo.worktrees/KAINE-7")
    );
  });

  it("resolves a configured worktreesDir against the checkout", () => {
    const repo = path.resolve("/src/repo");
    expect(worktreeDirFor(at(repo, path.join(repo, ".git"), "../wt"), 7)).toBe(
      path.resolve("/src/wt/KAINE-7")
    );
  });
});
