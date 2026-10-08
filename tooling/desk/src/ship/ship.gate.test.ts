import { describe, expect, it } from "vitest";

import {
  evaluateShipGate,
  SHIP_GATE_FAILURES,
  type ShipGateFailureKind,
  type ShipGateInput
} from "./ship.gate";
import { checkReportOf, sha256 } from "./ship.testing";
import { OWNER, repositoryOf } from "../testing/github.fake";

const HASH = sha256("code");
const BRANCH = "KAINE-7-feat-export-reports";

const passing = (): ShipGateInput => ({
  confirm: true,
  checks: { report: checkReportOf({ diffHash: HASH }), accept: ["ship"] },
  diffHash: HASH,
  changedPaths: ["src/feature.ts", "src/feature.test.ts"],
  identity: { ok: true, owner: OWNER, repository: repositoryOf() },
  branch: { actual: BRANCH, expected: BRANCH },
  authorization: { status: "unchanged" },
  refViolations: [],
  planApproved: true,
  review: { verdict: "approve", blockingFindings: 0, diffHash: HASH },
  expectedReviewDiffHash: HASH
});

const kindsOf = (input: ShipGateInput): ShipGateFailureKind[] =>
  evaluateShipGate(input).failures.map((failure) => failure.kind);

describe("evaluateShipGate", () => {
  it("passes when every rule holds", () => {
    expect(evaluateShipGate(passing())).toEqual({ ok: true, failures: [] });
  });

  // One row for each failure kind. Each row breaks exactly one rule.
  const cases: readonly (readonly [
    ShipGateFailureKind,
    (input: ShipGateInput) => ShipGateInput
  ])[] = [
    ["not-confirmed", (input) => ({ ...input, confirm: false })],
    ["checks-missing", (input) => ({ ...input, checks: { ...input.checks, report: null } })],
    [
      "checks-wrong-kind",
      (input) => ({
        ...input,
        checks: { report: checkReportOf({ kind: "loop", diffHash: HASH }), accept: ["ship"] }
      })
    ],
    [
      "checks-failed",
      (input) => ({
        ...input,
        checks: { ...input.checks, report: checkReportOf({ passed: false, diffHash: HASH }) }
      })
    ],
    [
      "checks-stale",
      (input) => ({
        ...input,
        checks: { ...input.checks, report: checkReportOf({ diffHash: sha256("older") }) }
      })
    ],
    [
      "identity",
      (input) => ({ ...input, identity: { ok: false, reason: "gh is signed in as someone else" } })
    ],
    ["branch-invalid", (input) => ({ ...input, branch: { actual: "main", expected: "main" } })],
    [
      "branch-mismatch",
      (input) => ({ ...input, branch: { actual: BRANCH, expected: "KAINE-8-fix-other" } })
    ],
    ["authorization-missing", (input) => ({ ...input, authorization: { status: "missing" } })],
    [
      "authorization-unavailable",
      (input) => ({ ...input, authorization: { status: "unavailable", reason: "HTTP 502" } })
    ],
    [
      "authorization-changed",
      (input) => ({
        ...input,
        authorization: { status: "changed", reasons: ["The issue body changed."] }
      })
    ],
    ["refs-baseline-missing", (input) => ({ ...input, refViolations: null })],
    [
      "refs-changed",
      (input) => ({ ...input, refViolations: ["head-moved at HEAD: aaaaaaaa -> bbbbbbbb"] })
    ],
    [
      "protected-paths",
      (input) => ({ ...input, changedPaths: [...input.changedPaths, ".ai/hooks/pre-tool-use.mjs"] })
    ],
    ["no-changes", (input) => ({ ...input, changedPaths: [] })],
    ["plan-not-approved", (input) => ({ ...input, planApproved: false })],
    ["review-missing", (input) => ({ ...input, review: null })],
    [
      "review-not-approved",
      (input) => ({
        ...input,
        review: { verdict: "changes-requested", blockingFindings: 1, diffHash: HASH }
      })
    ],
    [
      "review-stale",
      (input) => ({
        ...input,
        review: { verdict: "approve", blockingFindings: 0, diffHash: sha256("older") }
      })
    ]
  ];

  it("has a row for every failure kind", () => {
    expect(cases.map(([kind]) => kind).sort()).toEqual([...SHIP_GATE_FAILURES].sort());
  });

  it.each(cases)("fails with %s and with nothing else", (kind, mutate) => {
    const result = evaluateShipGate(mutate(passing()));
    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.kind)).toEqual([kind]);
    expect(result.failures[0]?.message.length).toBeGreaterThan(0);
  });

  it("reports every failed rule, not only the first", () => {
    const input = { ...passing(), confirm: false, planApproved: false, changedPaths: [] };
    expect(kindsOf(input)).toEqual(["not-confirmed", "no-changes", "plan-not-approved"]);
  });

  it("treats only the literal true as a confirmation", () => {
    // A caller that passes a truthy non-boolean through a loose boundary must not ship.
    // @ts-expect-error The test passes a string where a boolean is required.
    expect(kindsOf({ ...passing(), confirm: "yes" })).toEqual(["not-confirmed"]);
  });

  it("accepts a loop report before the ship checks, when the caller allows it", () => {
    const input: ShipGateInput = {
      ...passing(),
      checks: { report: checkReportOf({ kind: "loop", diffHash: HASH }), accept: ["loop", "ship"] }
    };
    expect(kindsOf(input)).toEqual([]);
  });

  it("flags a detached HEAD", () => {
    expect(kindsOf({ ...passing(), branch: { actual: null, expected: BRANCH } })).toEqual([
      "branch-invalid"
    ]);
  });

  it("accepts a branch without an issue number", () => {
    const branch = "KAINE-docs-fix-typo";
    expect(kindsOf({ ...passing(), branch: { actual: branch, expected: branch } })).toEqual([]);
  });

  it("flags a protected path by a rename's old path, an absolute path and a traversal", () => {
    for (const bad of [
      ".husky/pre-commit",
      "/etc/passwd",
      "../outside",
      ".env",
      ".github/workflows/ci.yml"
    ]) {
      expect(kindsOf({ ...passing(), changedPaths: ["src/a.ts", bad] })).toEqual([
        "protected-paths"
      ]);
    }
  });

  it("skips the review hash comparison when told to (after a rebase)", () => {
    const input: ShipGateInput = {
      ...passing(),
      review: { verdict: "approve", blockingFindings: 0, diffHash: sha256("before rebase") },
      expectedReviewDiffHash: null
    };
    expect(kindsOf(input)).toEqual([]);
  });

  it("does not ship an approving review that still has blocking findings", () => {
    expect(
      kindsOf({ ...passing(), review: { verdict: "approve", blockingFindings: 2, diffHash: HASH } })
    ).toEqual(["review-not-approved"]);
  });
});
