import { describe, expect, it } from "vitest";

import { REVIEW_SECTIONS } from "./agent-output.contract";
import {
  checkReportViewSchema,
  reviewArtifactViewSchema,
  shipPlanViewSchema
} from "./artifact-view.contract";
import { checkReportSchema, type CheckReport } from "../check/check.contract";
import { reviewArtifactSchema, type ReviewArtifact } from "../engine/pipeline.stage.review";
import { shipPlanSchema, type ShipPlan } from "../ship/ship.contract";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const AT = "2026-03-01T10:00:00.000Z";

describe("artifact view schemas", () => {
  it("read a check report the engine schema accepts", () => {
    const report: CheckReport = {
      passed: false,
      kind: "loop",
      steps: [
        {
          argv: ["pnpm", "check:affected"],
          code: 1,
          timedOut: false,
          tail: "FAIL src/a.test.ts",
          durationMs: 1200
        }
      ],
      fingerprint: "fp-1",
      diffHash: HASH,
      generatedDrift: false,
      startedAt: AT,
      finishedAt: AT
    };
    const stored = checkReportSchema.parse(report);
    expect(checkReportViewSchema.parse(JSON.parse(JSON.stringify(stored)))).toMatchObject({
      passed: false,
      steps: [{ tail: "FAIL src/a.test.ts" }]
    });
  });

  it.each([
    { kind: "none" as const, reason: "no package changed" },
    {
      kind: "file" as const,
      reason: "a package changed",
      path: ".changeset/a.md",
      packages: ["@repo/desk"],
      bump: "minor" as const
    },
    { kind: "skip-label" as const, reason: "docs only", label: "release:skip-changeset" }
  ])("read a ship plan with changeset $kind", (changeset) => {
    const plan: ShipPlan = {
      version: 1,
      issue: 7,
      dryRun: true,
      generatedAt: AT,
      branch: "KAINE-7-feat-thing",
      baseSha: SHA,
      gate: { ok: false, failures: [{ kind: "check", message: "The check report is stale" }] },
      changeset,
      changesetText: null,
      commitHeader: "feat(desk): add thing",
      pullRequest: { base: "main", draft: true, title: "feat(desk): add thing" },
      files: ["src/thing.ts"],
      bodyHeadings: ["Summary"],
      unfilledHeadings: [],
      attribution: [],
      commitlint: { ok: true, output: "" },
      gitIdentityProblem: null,
      pushes: "origin/KAINE-7-feat-thing"
    };
    const stored = shipPlanSchema.parse(plan);
    expect(shipPlanViewSchema.parse(JSON.parse(JSON.stringify(stored)))).toMatchObject({
      commitHeader: "feat(desk): add thing",
      changeset: { kind: changeset.kind }
    });
  });

  it("read an invalid changeset outcome", () => {
    const parsed = shipPlanViewSchema.safeParse({
      dryRun: true,
      branch: null,
      gate: { ok: true, failures: [] },
      changeset: { kind: "invalid", reason: "no package" },
      changesetText: null,
      commitHeader: "x",
      pullRequest: { title: "x" },
      files: [],
      unfilledHeadings: []
    });
    expect(parsed.success).toBe(true);
  });

  it("read the acceptance status of a review the engine schema accepts", () => {
    const artifact: ReviewArtifact = {
      review: {
        verdict: "approve",
        findings: [],
        acceptanceStatus: [
          { criterion: "Empty board explains", status: "partial", evidence: "a.tsx" }
        ],
        reviewSections: REVIEW_SECTIONS.map((heading) => ({ heading, verdict: "pass", notes: "" })),
        prDraft: { title: "feat: a", body: "Adds a." },
        plainLanguage: "Small and safe."
      },
      rejected: [],
      diffHash: HASH
    };
    const stored = reviewArtifactSchema.parse(artifact);
    expect(reviewArtifactViewSchema.parse(JSON.parse(JSON.stringify(stored)))).toEqual({
      review: {
        acceptanceStatus: [
          { criterion: "Empty board explains", status: "partial", evidence: "a.tsx" }
        ]
      }
    });
  });
});
