import { describe, expect, it } from "vitest";

import {
  API_ERROR_CODES,
  MAX_FEEDBACK_CHARS,
  REFUSAL_CODES,
  SERVER_ERROR_CODES,
  actionRequestSchema,
  actionTargetProblem,
  apiErrorSchema,
  flowStepViewsOf,
  issueSummarySchema,
  logEntrySchema,
  serverEventSchema
} from "./api.contract";
import type { FlowDefinition } from "./flow-definition.contract";
import { DEFAULT_SNAPSHOT } from "../testing/flow.testing";

describe("action request", () => {
  it.each([
    { input: { action: "start" }, expected: { action: "start", override: false } },
    { input: { action: "approve" }, expected: { action: "approve" } },
    {
      input: { action: "feedback", to: "build", text: "  fix the test  " },
      expected: { action: "feedback", to: "build", text: "fix the test" }
    },
    { input: { action: "continue" }, expected: { action: "continue" } },
    {
      input: { action: "continue", from: "check" },
      expected: { action: "continue", from: "check" }
    },
    { input: { action: "cancel" }, expected: { action: "cancel" } },
    { input: { action: "remove" }, expected: { action: "remove", force: false } },
    {
      input: { action: "ship", confirm: true },
      expected: { action: "ship", confirm: true, dryRun: false }
    },
    {
      input: { action: "ship", confirm: false, dryRun: true },
      expected: { action: "ship", confirm: false, dryRun: true }
    },
    { input: { action: "refresh-pr" }, expected: { action: "refresh-pr" } },
    { input: { action: "pr-feedback" }, expected: { action: "pr-feedback" } },
    {
      input: { action: "pr-feedback", text: "  keep the name  " },
      expected: { action: "pr-feedback", text: "keep the name" }
    },
    {
      input: { action: "approve", note: "  CSV only, no XLSX  " },
      expected: { action: "approve", note: "CSV only, no XLSX" }
    },
    { input: { action: "pause" }, expected: { action: "pause" } },
    { input: { action: "resume" }, expected: { action: "resume" } }
  ])("accepts $input", ({ input, expected }) => {
    expect(actionRequestSchema.parse(input)).toEqual(expected);
  });

  it.each([
    { name: "an unknown action", input: { action: "merge" } },
    { name: "an extra field", input: { action: "approve", worktree: "/tmp" } },
    { name: "empty feedback", input: { action: "feedback", to: "build", text: "   " } },
    {
      name: "feedback past the limit",
      input: { action: "feedback", to: "plan", text: "x".repeat(MAX_FEEDBACK_CHARS + 1) }
    },
    { name: "a real ship without confirm", input: { action: "ship", confirm: false } },
    { name: "a ship without confirm field", input: { action: "ship" } },
    { name: "a string where a boolean belongs", input: { action: "remove", force: "yes" } },
    // The engine reads the PR number from the issue state, never from the client.
    { name: "a refresh that names a PR", input: { action: "refresh-pr", pr: 9 } },
    { name: "PR feedback that names a PR", input: { action: "pr-feedback", pr: 9 } },
    { name: "blank PR feedback text", input: { action: "pr-feedback", text: "  " } },
    {
      name: "PR feedback text over the limit",
      input: { action: "pr-feedback", text: "x".repeat(MAX_FEEDBACK_CHARS + 1) }
    },
    { name: "a blank approval note", input: { action: "approve", note: "   " } },
    {
      name: "an approval note over the limit",
      input: { action: "approve", note: "x".repeat(MAX_FEEDBACK_CHARS + 1) }
    },
    { name: "a pause that names a stage", input: { action: "pause", stage: "build" } }
  ])("rejects $name", ({ input }) => {
    expect(actionRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe("action targets", () => {
  const DEFAULT_FLOW = DEFAULT_SNAPSHOT.flow;
  /** A flow without a plan gate, whose change gate sends work back to a custom step. */
  const CUSTOM: FlowDefinition = {
    id: "docs-only",
    name: "Docs only",
    description: "Write docs, check, approve, ship.",
    steps: [
      { id: "write", kind: "agent", label: "Write", agent: "builder" },
      { id: "verify", kind: "check", label: "Verify", commands: "loop" },
      { id: "approve-docs", kind: "gate", label: "Approve", sendBack: ["write", "verify"] },
      { id: "ship", kind: "ship", label: "Ship", auto: false }
    ]
  };
  const feedback = (to: string) => actionRequestSchema.parse({ action: "feedback", to, text: "x" });
  const resume = (from: string) => actionRequestSchema.parse({ action: "continue", from });

  it.each([
    { flow: DEFAULT_FLOW, request: feedback("plan") },
    { flow: DEFAULT_FLOW, request: feedback("review") },
    { flow: DEFAULT_FLOW, request: resume("setup") },
    { flow: DEFAULT_FLOW, request: resume("ship") },
    { flow: DEFAULT_FLOW, request: resume("pr-open") },
    { flow: CUSTOM, request: feedback("write") },
    { flow: CUSTOM, request: feedback("verify") },
    { flow: CUSTOM, request: resume("verify") }
  ])("accepts $request in $flow.id", ({ flow, request }) => {
    expect(actionTargetProblem(flow, request)).toBeNull();
  });

  it.each([
    // A gate and the ship are no targets in the default flow, by their kind.
    { flow: DEFAULT_FLOW, request: feedback("pr-review"), problem: "is a gate step" },
    { flow: DEFAULT_FLOW, request: feedback("ship"), problem: "is a ship step" },
    { flow: DEFAULT_FLOW, request: resume("plan-gate"), problem: "is a gate step" },
    { flow: DEFAULT_FLOW, request: feedback("setup"), problem: "is not a stage" },
    { flow: DEFAULT_FLOW, request: resume("needs-you"), problem: "is not a stage" },
    // A step of another flow is no step of this one.
    { flow: DEFAULT_FLOW, request: feedback("write"), problem: "is not a stage" },
    { flow: CUSTOM, request: feedback("build"), problem: "is not a stage" },
    { flow: CUSTOM, request: resume("approve-docs"), problem: "is a gate step" }
  ])("refuses $request in $flow.id", ({ flow, request, problem }) => {
    expect(actionTargetProblem(flow, request)).toContain(problem);
  });
});

describe("error codes", () => {
  it("keeps every code once", () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
    expect(API_ERROR_CODES.length).toBe(SERVER_ERROR_CODES.length + REFUSAL_CODES.length);
  });

  it("wraps a code in the error envelope", () => {
    expect(apiErrorSchema.parse({ error: { code: "busy", detail: null } })).toEqual({
      error: { code: "busy", detail: null }
    });
    expect(apiErrorSchema.safeParse({ error: { code: "teapot", detail: null } }).success).toBe(
      false
    );
  });
});

describe("server events", () => {
  it("parses a removal event", () => {
    expect(serverEventSchema.parse({ type: "issue-removed", issueNumber: 4 })).toEqual({
      type: "issue-removed",
      issueNumber: 4
    });
  });

  it("rejects an unknown event type", () => {
    expect(serverEventSchema.safeParse({ type: "other" }).success).toBe(false);
  });
});

describe("log entry", () => {
  const entry = { seq: 1, at: "2026-03-01T10:00:00.000Z", issueNumber: 3, kind: "log", text: "x" };

  it("reads an entry written before the stage tag, and one with it", () => {
    expect(logEntrySchema.parse(entry).stage).toBeUndefined();
    expect(logEntrySchema.parse({ ...entry, stage: "build" }).stage).toBe("build");
    expect(logEntrySchema.parse({ ...entry, stage: null }).stage).toBeNull();
    // A flow names its own steps, so only the id format is fixed.
    expect(logEntrySchema.safeParse({ ...entry, stage: "Deploy now" }).success).toBe(false);
  });
});

describe("issue summary", () => {
  const summary = {
    readable: true,
    issueNumber: 7,
    title: null,
    url: null,
    labels: [],
    stage: "build",
    status: "running",
    branch: null,
    loops: { check: 0, review: 0 },
    prRound: 0,
    prRoundLimit: 3,
    needsYouReason: null,
    resumeStage: null,
    prUrl: null,
    contract: { found: 6, total: 6 },
    stageEnteredAt: "2026-03-01T10:00:00.000Z",
    progress: ["passed", "passed", "passed", "running", "idle", "idle", "idle", "idle", "idle"],
    currentNode: "build",
    busy: false,
    paused: false,
    pausedAt: null,
    planRisk: "medium",
    flowId: "kaine-default",
    flowName: "Kaine default",
    flowHash: "a".repeat(64),
    flowSource: "builtin",
    flowSteps: flowStepViewsOf(DEFAULT_SNAPSHOT),
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z"
  };

  it("carries the board facts: contract, stage time, and one status for each flow node", () => {
    expect(issueSummarySchema.parse(summary)).toEqual(summary);
  });

  // A flow sets its own node count, so the list needs the ticket and at least one step.
  it("rejects a progress list without the ticket and a step", () => {
    expect(
      issueSummarySchema.safeParse({ ...summary, progress: summary.progress.slice(0, 1) }).success
    ).toBe(false);
  });
});
