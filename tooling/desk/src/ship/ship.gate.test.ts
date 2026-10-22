import { describe, expect, it } from "vitest";

import type { FlowSnapshot, FlowStep } from "../contracts";
import {
  evaluateShipGate,
  ownerApproved,
  SHIP_GATE_FAILURES,
  type ShipGateFailureKind,
  type ShipGateInput,
  type ShipGatePullRequest
} from "./ship.gate";
import { checkReportOf, sha256 } from "./ship.testing";
import { DEFAULT_SNAPSHOT } from "../testing/flow.testing";
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
  ownerApproved: true,
  review: { verdict: "approve", blockingFindings: 0, diffHash: HASH },
  expectedReviewDiffHash: HASH
});

const PUSHED = "a".repeat(40);
const OURS = "b".repeat(40);

/** An update ship: the PR is open, on the issue branch, at the head the desk pushed. */
const openPr = (view: Partial<Exclude<ShipGatePullRequest["view"], { error: string }>> = {}) =>
  ({
    number: 101,
    branch: BRANCH,
    allowedHeads: [PUSHED, OURS],
    view: {
      number: 101,
      url: "https://github.com/o/r/pull/101",
      state: "OPEN",
      headRefName: BRANCH,
      headRefOid: PUSHED,
      mergedAt: null,
      ...view
    }
  }) satisfies ShipGatePullRequest;

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
    ["owner-not-approved", (input) => ({ ...input, ownerApproved: false })],
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
    ],
    [
      "pr-unavailable",
      (input) => ({ ...input, pullRequest: { ...openPr(), view: { error: "HTTP 502" } } })
    ],
    ["pr-not-open", (input) => ({ ...input, pullRequest: openPr({ state: "CLOSED" }) })],
    [
      "pr-head-moved",
      (input) => ({ ...input, pullRequest: openPr({ headRefOid: "c".repeat(40) }) })
    ],
    ["pr-mismatch", (input) => ({ ...input, pullRequest: openPr({ headRefName: "other" }) })]
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
    const input = { ...passing(), confirm: false, ownerApproved: false, changedPaths: [] };
    expect(kindsOf(input)).toEqual(["not-confirmed", "no-changes", "owner-not-approved"]);
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

  it("passes an update whose PR is open at the pushed head or at the commit this run pushed", () => {
    expect(kindsOf({ ...passing(), pullRequest: openPr() })).toEqual([]);
    expect(kindsOf({ ...passing(), pullRequest: openPr({ headRefOid: OURS }) })).toEqual([]);
    expect(kindsOf({ ...passing(), pullRequest: null })).toEqual([]);
  });

  it("does not ship an approving review that still has blocking findings", () => {
    expect(
      kindsOf({ ...passing(), review: { verdict: "approve", blockingFindings: 2, diffHash: HASH } })
    ).toEqual(["review-not-approved"]);
  });
});

describe("the owner's approval a ship needs", () => {
  const steps = (ids: readonly string[]): FlowStep[] =>
    DEFAULT_SNAPSHOT.flow.steps.filter((step) => ids.includes(step.id));
  const flowOf = (list: readonly FlowStep[]): FlowSnapshot => ({
    ...DEFAULT_SNAPSHOT,
    flow: { ...DEFAULT_SNAPSHOT.flow, id: "custom", steps: [...list] }
  });
  const qaGate: FlowStep = { id: "qa", kind: "gate", label: "QA", sendBack: ["build"] };
  const autoShip: FlowStep = { id: "ship", kind: "ship", label: "Ship", auto: true };
  const event = (stage: string, name: string) => ({ stage, event: name });

  /** No plan gate: a QA gate after the checks, then the change approval before a manual ship. */
  const withQaGate = flowOf([
    ...steps(["plan", "build", "check"]),
    qaGate,
    ...steps(["review", "pr-review", "ship"])
  ]);

  it.each([
    {
      name: "the default flow after the plan approval",
      snapshot: DEFAULT_SNAPSHOT,
      history: [event("plan-gate", "plan-approved")],
      approved: true
    },
    {
      name: "the default flow without a plan approval",
      snapshot: DEFAULT_SNAPSHOT,
      history: [event("plan", "plan-ready"), event("review", "review-approved")],
      approved: false
    },
    {
      name: "a flow without a plan gate after its QA gate approval",
      snapshot: withQaGate,
      history: [event("qa", "gate-approved")],
      approved: true
    },
    {
      name: "a flow without a plan gate before its QA gate approval",
      snapshot: withQaGate,
      history: [event("check", "check-passed")],
      approved: false
    },
    {
      // An approval event at a stage that is no gate of this flow proves nothing.
      name: "an approval recorded at a stage that is not a gate of the flow",
      snapshot: withQaGate,
      history: [event("plan-gate", "plan-approved")],
      approved: false
    },
    {
      name: "a flow whose only gate is the ship gate: the confirmation there is the approval",
      snapshot: flowOf(steps(["build", "check", "pr-review", "ship"])),
      history: [],
      approved: true
    },
    {
      name: "an automatic ship, with no human approval at all",
      snapshot: flowOf([...steps(["plan", "plan-gate", "build", "check"]), autoShip]),
      history: [],
      approved: true
    }
  ])("$name: $approved", ({ snapshot, history, approved }) => {
    expect(ownerApproved(snapshot, history)).toBe(approved);
  });
});
