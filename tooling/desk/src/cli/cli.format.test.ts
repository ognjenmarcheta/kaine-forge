import { describe, expect, it } from "vitest";

import { issueStateSchema, type IssueState, type Stage } from "../contracts";
import { BELL, describeResult, formatState, nextSteps } from "./cli.format";
import type { PipelineResult, ShipDryRunResult } from "../engine/pipeline.types";
import { shipPlanSchema, type ShipPlan } from "../ship/ship.contract";

const stateAt = (stage: Stage, over: Partial<IssueState> = {}): IssueState =>
  issueStateSchema.parse({
    schemaVersion: 1,
    issueNumber: 12,
    stage,
    status: "waiting",
    resumeStage: null,
    branch: null,
    worktreePath: null,
    sessions: {},
    loops: { check: 1, review: 0 },
    lastCheckFingerprint: null,
    history: [],
    authorization: null,
    createdAt: "2026-10-07T09:00:00.000Z",
    updatedAt: "2026-10-07T09:00:00.000Z",
    ...over
  });

describe("nextSteps", () => {
  it("names the approve command at the plan gate", () => {
    expect(nextSteps(stateAt("plan-gate"))[0]).toBe("approve with: pnpm desk approve 12");
  });

  it("names the exact continue command and the stage it retries at needs-you", () => {
    expect(nextSteps(stateAt("needs-you", { resumeStage: "check" }))).toEqual([
      "continue with: pnpm desk continue 12 (retries 'check')",
      'or send feedback: pnpm desk feedback 12 --to build "<text>"'
    ]);
  });

  it("sends a failed intake back to start, because continue cannot restart intake", () => {
    expect(nextSteps(stateAt("needs-you", { resumeStage: "intake" }))).toEqual([
      "fix the issue, then run: pnpm desk start 12"
    ]);
  });

  it("offers a dry run and a confirmed ship at pr-review", () => {
    expect(nextSteps(stateAt("pr-review"))).toEqual([
      'send feedback: pnpm desk feedback 12 --to build|review|plan "<text>"',
      "see what ship would do: pnpm desk ship 12 --dry-run",
      "ship as a draft PR: pnpm desk ship 12 --confirm"
    ]);
  });

  it("names the draft PR after a ship and says that the engineer merges", () => {
    expect(
      nextSteps(
        stateAt("shipped", {
          status: "done",
          prUrl: "https://github.com/o/r/pull/101",
          prNumber: 101
        })
      )
    ).toEqual([
      "open the draft PR: https://github.com/o/r/pull/101",
      "review it and merge it yourself on GitHub. The desk never merges."
    ]);
  });

  it("has nothing to say where no person is needed", () => {
    for (const stage of ["plan", "build", "check", "review", "shipped", "cancelled"] as const) {
      expect(nextSteps(stateAt(stage))).toEqual([]);
    }
  });
});

describe("describeResult", () => {
  const refused = (over: Partial<Extract<PipelineResult, { outcome: "refused" }>> = {}) =>
    describeResult(12, {
      outcome: "refused",
      refusal: "leased",
      reason: "Another desk process drives #12.",
      state: stateAt("pr-review"),
      ...over
    });

  it("prints a typed refusal on stderr with exit code 1", () => {
    const view = refused();
    expect(view).toMatchObject({ code: 1, toStderr: true });
    expect(view.text).toBe("#12: refused (leased). Another desk process drives #12.\n");
    expect(view.json).toEqual({
      ok: false,
      issue: 12,
      outcome: "refused",
      refusal: "leased",
      reason: "Another desk process drives #12.",
      stage: "pr-review",
      status: "waiting"
    });
  });

  it("prints the PR URL in the shipped result and in the JSON", () => {
    const state = stateAt("shipped", {
      status: "done",
      prUrl: "https://github.com/o/r/pull/101",
      prNumber: 101
    });
    const view = describeResult(12, { outcome: "stopped", stop: "shipped", state, message: null });
    expect(view.code).toBe(0);
    expect(view.text).toContain("#12: shipped (stage shipped, done)");
    expect(view.text).toContain("open the draft PR: https://github.com/o/r/pull/101");
    expect(view.json).toMatchObject({
      ok: true,
      stop: "shipped",
      prUrl: "https://github.com/o/r/pull/101"
    });
  });

  it("rings the bell for a gate and for needs-you, but not for the end", () => {
    const stop = (kind: "gate" | "needs-you" | "shipped" | "cancelled", stage: Stage) =>
      describeResult(12, { outcome: "stopped", stop: kind, state: stateAt(stage), message: null });
    expect(stop("gate", "plan-gate").text.startsWith(BELL)).toBe(true);
    expect(stop("needs-you", "needs-you").text.startsWith(BELL)).toBe(true);
    expect(stop("shipped", "shipped").text.includes(BELL)).toBe(false);
    expect(stop("cancelled", "cancelled").text.includes(BELL)).toBe(false);
  });

  it("maps stops to exit codes: 0 at a gate or done, 1 at needs-you", () => {
    const code = (kind: "gate" | "needs-you" | "shipped" | "cancelled", stage: Stage) =>
      describeResult(12, { outcome: "stopped", stop: kind, state: stateAt(stage), message: null })
        .code;
    expect([
      code("gate", "pr-review"),
      code("shipped", "shipped"),
      code("cancelled", "cancelled")
    ]).toEqual([0, 0, 0]);
    expect(code("needs-you", "needs-you")).toBe(1);
  });
});

describe("describeResult for a ship dry run", () => {
  const plan = (over: Record<string, unknown> = {}): ShipPlan =>
    shipPlanSchema.parse({
      version: 1,
      issue: 12,
      dryRun: true,
      generatedAt: "2026-10-07T09:00:00.000Z",
      branch: "KAINE-12-feat-x",
      baseSha: "a".repeat(40),
      gate: { ok: true, failures: [] },
      changeset: {
        kind: "file",
        reason: "source changed",
        path: ".changeset/x.md",
        packages: ["@repo/desk"],
        bump: "minor"
      },
      changesetText: "---\n---\n",
      commitHeader: "feat: x",
      pullRequest: { base: "main", draft: true, title: "feat: x" },
      files: [".changeset/x.md", "tooling/desk/src/x.ts"],
      bodyHeadings: ["Summary"],
      unfilledHeadings: [],
      attribution: [],
      commitlint: { ok: true, output: "" },
      gitIdentityProblem: null,
      pushes: "origin KAINE-12-feat-x",
      ...over
    });
  const dryRun = (over: Record<string, unknown> = {}): ShipDryRunResult => ({
    outcome: "dry-run",
    state: stateAt("pr-review"),
    plan: plan(over),
    files: { plan: "/a/ship-plan.json", prBody: "/a/pr-body.md", commitMessage: "/a/c.txt" }
  });

  it("prints the plan, the files, the title, the changeset and the PR body path", () => {
    const view = describeResult(12, dryRun());
    expect(view).toMatchObject({ code: 0, toStderr: false });
    expect(view.text).toContain("#12: ship dry run. Nothing was changed.");
    expect(view.text).toContain("Gate: it would pass.");
    expect(view.text).toContain('PR: draft against main, title "feat: x"');
    expect(view.text).toContain(
      "Changeset: a changeset file .changeset/x.md (minor for @repo/desk)"
    );
    expect(view.text).toContain("Files (2):\n  .changeset/x.md\n  tooling/desk/src/x.ts");
    expect(view.text).toContain("PR body: /a/pr-body.md");
    expect(view.text).toContain("Next: pnpm desk ship 12 --confirm");
    expect(view.json).toMatchObject({ ok: true, outcome: "dry-run", issue: 12 });
  });

  it("exits 1 and lists the blockers when the gate would refuse", () => {
    const view = describeResult(
      12,
      dryRun({
        gate: { ok: false, failures: [{ kind: "checks-stale", message: "The checks are old." }] },
        commitlint: { ok: false, output: "subject empty" },
        changeset: { kind: "skip-label", reason: "docs", label: "release:skip-changeset" }
      })
    );
    expect(view.code).toBe(1);
    expect(view.text).toContain("Gate: it would refuse.\n  - checks-stale: The checks are old.");
    expect(view.text).toContain("Problem: commitlint rejects the message: subject empty");
    expect(view.text).toContain("the PR gets the 'release:skip-changeset' label");
    expect(view.text).not.toContain("Next: pnpm desk ship");
  });
});

describe("formatState", () => {
  it("shows the needs-you reason and the next step", () => {
    const lines = formatState(
      stateAt("needs-you", {
        resumeStage: "build",
        history: [
          { at: "2026-10-07T09:00:00.000Z", stage: "needs-you", event: "needs-you", note: "Boom" }
        ]
      })
    );
    expect(lines).toContain("  needs you: Boom");
    expect(lines).toContain("  next: continue with: pnpm desk continue 12 (retries 'build')");
  });
});
