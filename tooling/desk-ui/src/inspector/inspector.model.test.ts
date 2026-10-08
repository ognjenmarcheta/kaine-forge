import {
  buildFlowModel,
  type FlowNodeId,
  type IssueDetail,
  type LogEntry,
  type PlannerOutput
} from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import {
  anomaliesOf,
  buildChecklist,
  checkChecklist,
  contractChecklist,
  loopsOf,
  planChecklist,
  resolveSelection,
  reviewChecklist,
  sameFailureStop,
  shipChecklist,
  stageKpis,
  type Kpi
} from "./inspector.model";
import { scenarioBoard } from "../../tests/fixture.data";
import { makeDetail } from "../test/test.render";

const seed = (issueNumber: number) => {
  const issue = scenarioBoard().find((entry) => entry.state.issueNumber === issueNumber);
  if (issue === undefined) throw new Error("missing seed");
  return issue;
};

/** A detail built from a fixture issue, as the server sends it. */
const detailOf = (issueNumber: number, patch: Partial<IssueDetail> = {}): IssueDetail => {
  const { state } = seed(issueNumber);
  const base = makeDetail(state).detail;
  return { ...base, state, flow: buildFlowModel(state, Date.now()), ...patch };
};

const nodeOf = (detail: IssueDetail, id: FlowNodeId) => {
  const node = detail.flow.nodes.find((entry) => entry.id === id);
  if (node === undefined) throw new Error(`missing node ${id}`);
  return node;
};

const tile = (kpis: readonly Kpi[], id: string) => kpis.find((kpi) => kpi.id === id);

const PLAN: PlannerOutput = {
  summary: "Add an empty state.",
  files: [{ path: "a.tsx", action: "create", purpose: "The state" }],
  tests: [],
  acceptanceCriteria: [{ criterion: "Explains how to start", change: "a.tsx" }],
  risks: [],
  openQuestions: ["Link the docs?"],
  changeset: { required: false, packages: [], bump: "patch" },
  pr: { type: "feat", slug: "empty" },
  plainLanguage: "The board explains itself."
};

describe("resolveSelection", () => {
  it("defaults to the current stage and keeps a picked stage while new data arrives", () => {
    const first = detailOf(104).flow;
    expect(resolveSelection(null, first)).toBe("build");
    expect(resolveSelection("plan", first)).toBe("plan");
    // The issue moves on: the picked stage stays, the default follows the issue.
    const moved = detailOf(102).flow;
    expect(resolveSelection("plan", moved)).toBe("plan");
    expect(resolveSelection(null, moved)).toBe("pr-review");
  });

  it("falls back to the ticket when no stage holds the issue", () => {
    expect(resolveSelection(null, { nodes: [], edges: [], current: null })).toBe("ticket");
  });
});

describe("stageKpis", () => {
  it("always shows four tiles: runs, duration, loops, and one of the stage's own", () => {
    const detail = detailOf(102);
    for (const node of detail.flow.nodes) {
      expect(
        stageKpis(node, detail, detail.flow)
          .map((kpi) => kpi.id)
          .slice(0, 3)
      ).toEqual(["runs", "duration", "loops"]);
    }
  });

  it("counts the runs and the loops back from check, and the steps that passed", () => {
    const detail = detailOf(102, {
      check: {
        passed: false,
        kind: "loop",
        steps: [
          { argv: ["pnpm", "generate"], code: 0, timedOut: false, durationMs: 4200 },
          { argv: ["pnpm", "check"], code: 1, timedOut: false, durationMs: 61_000 }
        ],
        fingerprint: "fp",
        diffHash: "a".repeat(64),
        generatedDrift: false,
        startedAt: "2026-03-01T10:00:00.000Z",
        finishedAt: "2026-03-01T10:01:00.000Z"
      }
    });
    const kpis = stageKpis(nodeOf(detail, "check"), detail, detail.flow);
    expect(tile(kpis, "runs")?.value).toEqual({ kind: "count", value: 2 });
    expect(tile(kpis, "loops")).toMatchObject({
      label: "desk.inspector.kpi.wentBack",
      value: { kind: "count", value: 1 },
      tone: "warning"
    });
    expect(tile(kpis, "steps")).toMatchObject({
      value: { kind: "ratio", value: 1, total: 2 },
      tone: "danger"
    });
  });

  it("counts loops that came back into build, and the build's files once its artifact loads", () => {
    const detail = detailOf(104);
    const build = nodeOf(detail, "build");
    expect(tile(stageKpis(build, detail, detail.flow), "loops")).toMatchObject({
      label: "desk.inspector.kpi.cameBack",
      value: { kind: "count", value: 1 }
    });
    expect(
      tile(stageKpis(build, detail, detail.flow, { build: { status: "loading" } }), "files")?.value
    ).toEqual({ kind: "loading" });
    expect(
      tile(
        stageKpis(build, detail, detail.flow, {
          build: {
            status: "ok",
            value: {
              summary: "s",
              filesChanged: ["a", "b"],
              notes: [],
              blockers: [],
              claimedChecks: [],
              plainLanguage: "p"
            }
          }
        }),
        "files"
      )?.value
    ).toEqual({ kind: "count", value: 2 });
  });

  it("shows an ongoing wait at a gate as waiting, and the plan's files", () => {
    const detail = detailOf(101);
    const kpis = stageKpis(nodeOf(detail, "plan-gate"), detail, detail.flow, {
      plan: { status: "ok", value: PLAN }
    });
    expect(tile(kpis, "duration")?.label).toBe("desk.inspector.kpi.waiting");
    expect(tile(kpis, "files")?.value).toEqual({ kind: "count", value: 1 });
  });

  it("shows the contract for the ticket, findings for review, readiness and the PR", () => {
    const detail = detailOf(102, {
      contract: { found: 5, total: 6, missing: ["Out of scope"] },
      review: {
        verdict: "approve",
        blocking: 1,
        bySeverity: { Critical: 1, Consider: 1, Nit: 0, FYI: 0 },
        findings: [],
        rejected: 0,
        diffHash: "a".repeat(64),
        plainLanguage: "ok"
      }
    });
    expect(
      tile(stageKpis(nodeOf(detail, "ticket"), detail, detail.flow), "contract")
    ).toMatchObject({ value: { kind: "ratio", value: 5, total: 6 }, tone: "warning" });
    expect(
      tile(stageKpis(nodeOf(detail, "review"), detail, detail.flow), "findings")
    ).toMatchObject({ value: { kind: "findings", total: 0, blocking: 1 }, tone: "danger" });
    expect(
      tile(stageKpis(nodeOf(detail, "pr-review"), detail, detail.flow), "ready")
    ).toMatchObject({ value: { kind: "ratio", value: 4, total: 4 }, tone: "success" });
    const shipped = detailOf(105);
    expect(tile(stageKpis(nodeOf(shipped, "ship"), shipped, shipped.flow), "pr")?.value).toEqual({
      kind: "text",
      text: "#321"
    });
  });
});

describe("loopsOf", () => {
  it("counts loops that left a stage and loops that came into it", () => {
    const flow = detailOf(103).flow;
    expect(loopsOf("check", flow)).toEqual({ from: 1, to: 0 });
    expect(loopsOf("build", flow)).toEqual({ from: 0, to: 1 });
  });
});

describe("checklists", () => {
  it("never reads an unknown ship rule as a pass", () => {
    const items = shipChecklist({
      atGate: true,
      checkPassed: true,
      reviewApproved: false,
      reviewedDiffMatches: null,
      currentDiffMatches: true,
      ready: false
    });
    expect(items.map((item) => item.state)).toEqual(["pass", "fail", "pending", "pass"]);
  });

  it("lists the contract count and every missing section", () => {
    expect(contractChecklist(null)).toEqual([]);
    const items = contractChecklist({ found: 5, total: 6, missing: ["Out of scope"] });
    expect(items.map((item) => [item.state, item.text])).toEqual([
      [
        "fail",
        { kind: "key", key: "desk.ticket.contractProgress", values: { found: 5, total: 6 } }
      ],
      ["fail", { kind: "raw", text: "Out of scope" }]
    ]);
  });

  it("marks a mapped acceptance criterion as passed", () => {
    expect(planChecklist(PLAN)).toEqual([
      {
        id: "criterion-0",
        state: "pass",
        text: { kind: "raw", text: "Explains how to start" },
        detail: { kind: "raw", text: "a.tsx" }
      }
    ]);
  });

  it("fails blockers and keeps the builder's claims as claims", () => {
    const items = buildChecklist({
      summary: "s",
      filesChanged: [],
      notes: [],
      blockers: ["No database"],
      claimedChecks: [
        { command: "pnpm test", result: "pass" },
        { command: "pnpm lint", result: "not-run" }
      ],
      plainLanguage: "p"
    });
    expect(items.map((item) => item.state)).toEqual(["fail", "pass", "pending"]);
  });

  it("shows each check step with its result and duration", () => {
    const items = checkChecklist({
      passed: false,
      kind: "loop",
      steps: [
        { argv: ["pnpm", "generate"], code: 0, timedOut: false, durationMs: 4200 },
        { argv: ["pnpm", "test"], code: null, timedOut: true, durationMs: 90_000 }
      ],
      fingerprint: null,
      diffHash: "a".repeat(64),
      generatedDrift: false,
      startedAt: "2026-03-01T10:00:00.000Z",
      finishedAt: "2026-03-01T10:01:00.000Z"
    });
    expect(items).toMatchObject([
      { state: "pass", text: { text: "pnpm generate" }, durationMs: 4200 },
      { state: "fail", detail: { kind: "key", key: "desk.check.timedOut" }, durationMs: 90_000 }
    ]);
  });

  it("maps the reviewer's acceptance status to pass, partly, and fail", () => {
    const items = reviewChecklist({
      review: {
        acceptanceStatus: [
          { criterion: "a", status: "met", evidence: "x" },
          { criterion: "b", status: "partial", evidence: "y" },
          { criterion: "c", status: "missing", evidence: "z" }
        ]
      }
    });
    expect(items.map((item) => item.state)).toEqual(["pass", "warn", "fail"]);
  });
});

describe("anomaliesOf", () => {
  const log = (text: string): LogEntry => ({
    seq: 1,
    at: "2026-03-01T10:00:00.000Z",
    issueNumber: 103,
    kind: "log",
    text
  });

  it("shows the loops of check, the stop, the early stop, and denied tool calls", () => {
    const detail = detailOf(103);
    const stopped = {
      ...detail,
      summary: { ...makeDetail().summary, needsYouReason: "Two checks failed:\nFAIL a.test.tsx" }
    };
    expect(anomaliesOf(nodeOf(detail, "check"), stopped, detail.flow, [])).toEqual([
      { kind: "loop", loop: "check", count: 1 },
      { kind: "same-failure" }
    ]);
    expect(
      anomaliesOf(nodeOf(detail, "build"), stopped, detail.flow, [
        log("builder: blocked by the permission rules. Permission denied for Bash: curl"),
        log("planner: blocked by the permission rules. Permission denied for Bash: rm")
      ])
    ).toEqual([
      { kind: "needs-you", excerpt: "Two checks failed: FAIL a.test.tsx" },
      { kind: "denials", count: 1 },
      { kind: "same-failure" }
    ]);
  });

  it("has nothing to report for a clean stage", () => {
    const detail = detailOf(102);
    expect(anomaliesOf(nodeOf(detail, "plan"), detail, detail.flow, [])).toEqual([]);
  });
});

describe("sameFailureStop", () => {
  const at = "2026-03-01T10:00:00.000Z";
  it("is true only when the stop follows a failure equal to the one before", () => {
    const failed = (note: string) => ({ at, stage: "check" as const, event: "check-failed", note });
    const stop = { at, stage: "needs-you" as const, event: "needs-you" };
    expect(sameFailureStop([failed("fp a"), failed("fp a"), stop])).toBe(true);
    expect(sameFailureStop([failed("fp a"), failed("fp b"), stop])).toBe(false);
    expect(sameFailureStop([failed("fp a"), failed("fp a")])).toBe(false);
  });
});
