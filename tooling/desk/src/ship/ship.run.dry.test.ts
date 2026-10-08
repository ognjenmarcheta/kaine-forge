import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, vi } from "vitest";

import { SHIP_PLAN_FILE, SHIP_RECORD_FILE, SHIP_CHECK_DIR, shipPlanSchema } from "./ship.contract";
import { parseTemplate } from "./ship.pr-body";
import { shipIssue } from "./ship.run";
import {
  expectSafeCalls,
  fileExists,
  gitArgv,
  pnpmRuns,
  shipTest,
  worktreeStatus
} from "./ship.testing";

vi.setConfig({ testTimeout: 180_000 });

const SOURCE = { "tooling/desk/src/feature.ts": "export const feature = 1;\n" };
const RELEASABLE = {
  changeset: { required: true, packages: ["@repo/desk"], bump: "minor" as const }
};

describe("shipIssue with dryRun", () => {
  shipTest(
    "writes the plan, the PR body and the commit message and changes nothing else",
    {
      edits: SOURCE,
      plan: RELEASABLE
    },
    async (env) => {
      const statusBefore = await worktreeStatus(env);
      const headBefore = await env.clone.git(["rev-parse", "HEAD"], env.worktree);

      const result = await env.ship({ dryRun: true });
      expect(result.status).toBe("dry-run");
      if (result.status !== "dry-run") return;

      // The worktree, HEAD and the index are as they were. No changeset file was written.
      expect(await worktreeStatus(env)).toBe(statusBefore);
      expect(await env.clone.git(["rev-parse", "HEAD"], env.worktree)).toBe(headBefore);
      expect(await fileExists(path.join(env.worktree, ".changeset/export-reports.md"))).toBe(false);

      // No write call: nothing was staged, committed, pushed, rebased or sent to GitHub.
      const mutating = ["add", "commit", "push", "rebase", "reset", "fetch", "restore"];
      expect(gitArgv(env).filter((argv) => mutating.includes(argv[0] ?? ""))).toEqual([]);
      expect(pnpmRuns(env, "check")).toBe(0);
      expect(env.github.createdPullRequests).toEqual([]);
      expect(env.github.pullRequestLabels).toEqual([]);
      expect(env.github.labelEdits).toEqual([]);
      expect(await env.hookLog()).toEqual([]);
      expect(await fileExists(path.join(env.artifactsDir, SHIP_RECORD_FILE))).toBe(false);
      expect(await fileExists(path.join(env.artifactsDir, SHIP_CHECK_DIR))).toBe(false);
      expectSafeCalls(env);

      // The three files are in the artifacts directory.
      expect(result.files).toEqual({
        plan: path.join(env.artifactsDir, SHIP_PLAN_FILE),
        prBody: path.join(env.artifactsDir, "pr-body.md"),
        commitMessage: path.join(env.artifactsDir, "commit-message.txt")
      });
      const plan = shipPlanSchema.parse(JSON.parse(await readFile(result.files.plan, "utf8")));
      expect(plan).toEqual(result.plan);
      expect(plan).toMatchObject({
        dryRun: true,
        issue: 7,
        branch: env.branch,
        baseSha: env.baseSha,
        gate: { ok: true, failures: [] },
        changeset: { kind: "file", path: ".changeset/export-reports.md", bump: "minor" },
        changesetText: '---\n"@repo/desk": minor\n---\n\nAdd a CSV export for reports.\n',
        commitHeader: "feat: export reports as CSV",
        pullRequest: { base: "main", draft: true, title: "feat: export reports as CSV" },
        files: [".changeset/export-reports.md", "tooling/desk/src/feature.ts"],
        unfilledHeadings: [],
        attribution: [],
        commitlint: { ok: true },
        gitIdentityProblem: null,
        pushes: `origin ${env.branch}`
      });

      const body = await readFile(result.files.prBody, "utf8");
      expect(body).toContain("Closes #7");
      expect(parseTemplate(body).sections.map((section) => section.title)).toEqual(
        plan.bodyHeadings
      );
      const message = await readFile(result.files.commitMessage, "utf8");
      expect(message).toMatch(/^feat: export reports as CSV\n\n/);
      expect(message).toContain("Refs #7");
    }
  );

  shipTest(
    "shows the failed gate rules, an invalid changeset and an attribution in the plan",
    {
      edits: SOURCE
    },
    async (env) => {
      const gate = await env.ship({ dryRun: true, confirm: false });
      expect(gate.status).toBe("dry-run");
      if (gate.status === "dry-run") {
        expect(gate.plan.gate.ok).toBe(false);
        expect(gate.plan.gate.failures.map((failure) => failure.kind)).toEqual(["not-confirmed"]);
        expect(gate.plan.changeset).toMatchObject({ kind: "skip-label" });
      }

      await env.setPlan({
        changeset: { required: true, packages: ["@repo/ghost"], bump: "patch" }
      });
      const invalid = await env.ship({ dryRun: true });
      expect(invalid.status).toBe("dry-run");
      if (invalid.status === "dry-run") {
        expect(invalid.plan.changeset).toMatchObject({ kind: "invalid" });
        expect(invalid.plan.changesetText).toBeNull();
      }

      await env.setPlan({ summary: "Add x.\n\nGenerated with Claude Code" });
      const attribution = await env.ship({ dryRun: true });
      expect(attribution.status).toBe("dry-run");
      if (attribution.status === "dry-run") {
        expect(attribution.plan.attribution.length).toBeGreaterThan(0);
      }
    }
  );
});

describe("shipIssue and a missing state", () => {
  shipTest("returns a typed failure for an issue with no state", { edits: SOURCE }, async (env) => {
    const result = await shipIssue(env.deps, { issue: 99, confirm: true });
    expect(result).toMatchObject({
      status: "failed",
      failure: { kind: "state", message: expect.stringContaining("#99") }
    });
    expect(gitArgv(env)).toEqual([]);
  });
});
