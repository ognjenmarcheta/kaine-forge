import { describe, expect, it } from "vitest";

import { stageEnteredAt } from "./pipeline.state";
import type { HistoryEvent, IssueState, Stage } from "../contracts";

const at = (minute: number): string => `2026-03-01T10:${String(minute).padStart(2, "0")}:00.000Z`;
const event = (minute: number, stage: Stage, name: string): HistoryEvent => ({
  at: at(minute),
  stage,
  event: name
});

const state = (stage: Stage, history: HistoryEvent[]): IssueState => ({
  schemaVersion: 1,
  issueNumber: 7,
  stage,
  status: "waiting",
  resumeStage: null,
  branch: null,
  worktreePath: null,
  sessions: {},
  loops: { check: 0, review: 0 },
  lastCheckFingerprint: null,
  history,
  authorization: null,
  createdAt: at(0),
  updatedAt: at(0)
});

const toPlanGate = [
  event(0, "intake", "intake-started"),
  event(1, "setup", "stage-started"),
  event(2, "plan", "stage-started"),
  event(3, "plan", "plan-ready")
];

describe("stageEnteredAt", () => {
  it.each([
    ["the intake start", "intake", [event(0, "intake", "intake-started")], at(0)],
    ["a stage start", "plan", toPlanGate.slice(0, 3), at(2)],
    ["the event that reaches a gate", "plan-gate", toPlanGate, at(3)],
    [
      "the latest gate arrival after a re-plan",
      "plan-gate",
      [
        ...toPlanGate,
        event(4, "plan-gate", "feedback"),
        event(5, "plan", "stage-started"),
        event(6, "plan", "plan-ready")
      ],
      at(6)
    ],
    [
      "the review approval for the PR gate",
      "pr-review",
      [event(8, "review", "stage-started"), event(9, "review", "review-approved")],
      at(9)
    ],
    [
      "the stop that sent the issue to the engineer",
      "needs-you",
      [event(4, "build", "stage-started"), event(5, "needs-you", "needs-you")],
      at(5)
    ],
    ["the cancel", "cancelled", [...toPlanGate, event(7, "plan-gate", "cancelled")], at(7)],
    ["the ship", "shipped", [event(8, "ship", "stage-started"), event(9, "ship", "shipped")], at(9)]
  ] as const)("reads %s", (_name, stage, history, expected) => {
    expect(stageEnteredAt(state(stage, [...history]))).toBe(expected);
  });

  it("says nothing while a queued stage has not written its start", () => {
    // The plan was approved, so the build is queued, but its `stage-started` is not there yet.
    const history = [...toPlanGate, event(4, "plan-gate", "plan-approved")];
    expect(stageEnteredAt(state("build", history))).toBeNull();
  });

  it("ignores an older start of the same stage once the issue moved on and back", () => {
    const history = [
      event(4, "build", "stage-started"),
      event(5, "check", "stage-started"),
      event(6, "check", "check-failed")
    ];
    expect(stageEnteredAt(state("build", history))).toBeNull();
  });

  it("is null for an empty history", () => {
    expect(stageEnteredAt(state("intake", []))).toBeNull();
  });
});
