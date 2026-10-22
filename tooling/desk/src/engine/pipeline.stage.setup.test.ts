import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { deskConfigSchema } from "../contracts";
import { worktreeDirFor } from "./pipeline.stage.setup";
import { ISSUE, createPipelineEnv, planOutput } from "../testing/pipeline.testing";

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

describe("setupStage with real git", () => {
  vi.setConfig({ testTimeout: 60_000 });

  it("forks the worktree from the configured base branch and records it", async () => {
    const env = await createPipelineEnv({
      git: "real",
      config: { baseBranch: "develop" },
      steps: [{ role: "planner", output: planOutput() }]
    });
    try {
      const clone = env.clone;
      if (clone === null) throw new Error("real mode has a clone");
      // `develop` is one commit ahead of `main`, so the fork point tells the two apart.
      await clone.git(["checkout", "--quiet", "-b", "develop"]);
      await clone.write("develop.txt", "only on develop\n");
      const developSha = await clone.commit("develop only");
      await clone.git(["push", "--quiet", "origin", "develop"]);
      await clone.git(["checkout", "--quiet", "main"]);

      await env.pipeline.start(ISSUE, { override: false });

      const read = await env.store.read(ISSUE);
      if (read.status !== "ok") throw new Error(`state is ${read.status}`);
      expect(read.state).toMatchObject({ baseBranch: "develop", baseSha: developSha });
      expect(await clone.git(["rev-parse", "HEAD"], env.worktree())).toBe(developSha);
    } finally {
      await env.cleanup();
    }
  });
});
