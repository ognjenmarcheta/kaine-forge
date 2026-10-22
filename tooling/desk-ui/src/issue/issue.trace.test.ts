import {
  buildFlowModel,
  type HistoryEvent,
  type LogEntry,
  type RunRecord,
  type Stage
} from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import { buildTrace, filterSteps, jumpTargetOf, linesByStep, type TraceLive } from "./issue.trace";
import { makeState } from "../test/test.render";

const T0 = Date.parse("2026-03-01T10:00:00.000Z");
const MINUTE = 60_000;
const at = (minute: number): string => new Date(T0 + minute * MINUTE).toISOString();
const event = (minute: number, stage: Stage, name: string): HistoryEvent => ({
  at: at(minute),
  stage,
  event: name
});

/** Plan, approval, two builds whose checks failed, then the desk stopped. */
const HISTORY: readonly HistoryEvent[] = [
  event(0, "intake", "intake-started"),
  event(1, "setup", "intake-complete"),
  event(2, "plan", "stage-started"),
  event(5, "plan", "plan-ready"),
  event(9, "plan-gate", "plan-approved"),
  event(10, "build", "stage-started"),
  event(20, "check", "stage-started"),
  event(22, "check", "check-failed"),
  event(23, "build", "stage-started"),
  event(30, "check", "stage-started"),
  event(31, "check", "check-failed"),
  event(32, "needs-you", "needs-you")
];
const NOW = T0 + 40 * MINUTE;

const run = (minute: number, role: RunRecord["role"], costUsd: number | null): RunRecord => ({
  schema: 1,
  at: at(minute),
  issue: 7,
  role,
  provider: "claude",
  model: null,
  isolation: "host",
  loops: { check: 0, review: 0 },
  durationMs: MINUTE,
  ok: true,
  accepted: true,
  failureKind: null,
  usage: null,
  costUsd,
  turns: null,
  toolCalls: 0,
  editCalls: 0,
  failedToolCalls: 0,
  denials: 0,
  harness: null,
  planRisk: null
});

const traceOf = (
  history: readonly HistoryEvent[],
  live: TraceLive,
  runs: readonly RunRecord[] = []
) => {
  const state = makeState({ stage: "needs-you", status: "waiting", history: [...history] });
  return buildTrace(history, runs, buildFlowModel(state, NOW), NOW, live);
};

describe("buildTrace", () => {
  it("cuts the history into runs of a stage, gate time apart, with rounds and outcomes", () => {
    const trace = traceOf(HISTORY, "waiting", [
      run(3, "planner", 0.4),
      run(11, "builder", 1),
      run(24, "builder", 0.5),
      run(26, "builder", null),
      run(12, "reviewer", 9)
    ]);
    expect(
      trace.steps.map((step) => [step.key, step.round, step.outcome, step.endMs - step.startMs])
    ).toEqual([
      ["ticket", 1, "passed", 2 * MINUTE],
      ["plan", 1, "passed", 3 * MINUTE],
      // The approval wait starts when the plan is ready, not when the plan stage started.
      ["plan-gate", 1, "passed", 5 * MINUTE],
      ["build", 1, "passed", 10 * MINUTE],
      ["check", 1, "looped", 3 * MINUTE],
      ["build", 2, "passed", 7 * MINUTE],
      ["check", 2, "looped", 2 * MINUTE],
      ["needs-you", 1, "failed", 8 * MINUTE]
    ]);
    const stop = trace.steps.at(-1);
    expect(stop).toMatchObject({ kind: "stop", node: "check", ongoing: true, endMs: NOW });
    // A run's cost goes to the round it started in; a run with no cost leaves the sum alone.
    expect(trace.steps.map((step) => [step.runs, step.costUsd])).toEqual([
      [0, null],
      [1, 0.4],
      [0, null],
      [1, 1],
      [0, null],
      [2, 0.5],
      [0, null],
      [0, null]
    ]);
    expect(trace.agentMs).toBe(20 * MINUTE);
    expect(trace.youMs).toBe(13 * MINUTE);
  });

  it("reads the last step as running, waiting, or ended by the issue's state", () => {
    const toBuild = HISTORY.slice(0, 6);
    expect(traceOf(toBuild, "running").steps.at(-1)).toMatchObject({
      outcome: "running",
      ongoing: true,
      endMs: NOW
    });
    const atGate = traceOf(HISTORY.slice(0, 4), "waiting").steps.at(-1);
    expect(atGate).toMatchObject({ key: "plan-gate", outcome: "waiting" });
    const ended = traceOf(toBuild, "ended").steps.at(-1);
    expect(ended).toMatchObject({ ongoing: false, outcome: "passed", endMs: T0 + 10 * MINUTE });
  });

  it("counts the problems and jumps to the failure that stopped it, else the first problem", () => {
    const { steps, problems } = traceOf(HISTORY, "waiting");
    expect(problems).toBe(3);
    expect(filterSteps(steps, "problems")).toHaveLength(problems);
    expect(filterSteps(steps, "agents").map((step) => step.key)).toEqual([
      "plan",
      "build",
      "build"
    ]);
    expect(jumpTargetOf(steps, true)?.key).toBe("needs-you");
    expect(jumpTargetOf(steps, false)).toMatchObject({ key: "check", round: 1 });
    expect(jumpTargetOf(traceOf(HISTORY.slice(0, 6), "running").steps, false)).toBeNull();
  });
});

describe("linesByStep", () => {
  const entry = (seq: number, minute: number, stage: Stage | null): LogEntry => ({
    seq,
    at: at(minute),
    issueNumber: 7,
    kind: "log",
    stage,
    text: `line ${String(seq)}`
  });

  it("puts a line in the run of its stage, and a line with no stage by its time", () => {
    const { steps } = traceOf(HISTORY, "waiting");
    const { byStep, unassigned } = linesByStep(steps, [
      entry(1, 21, "check"),
      entry(2, 30.5, "check"),
      // Written as the plan finished: it belongs to the plan, not to the gate that starts then.
      entry(3, 5, "plan"),
      entry(4, 24, null),
      // No review step yet: placed by its time, and marked so.
      entry(5, 25, "review"),
      entry(6, -1, null)
    ]);
    const linesOf = (key: string, round: number) => {
      const step = steps.find((entry) => entry.key === key && entry.round === round);
      return (byStep.get(step?.id ?? "") ?? []).map((line) => [line.entry.seq, line.byTime]);
    };
    expect(linesOf("check", 1)).toEqual([[1, false]]);
    expect(linesOf("check", 2)).toEqual([[2, false]]);
    expect(linesOf("plan", 1)).toEqual([[3, false]]);
    expect(linesOf("build", 2)).toEqual([
      [4, true],
      [5, true]
    ]);
    expect(unassigned).toBe(1);
  });
});
