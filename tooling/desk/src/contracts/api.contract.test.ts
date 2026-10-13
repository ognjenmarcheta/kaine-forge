import { describe, expect, it } from "vitest";

import {
  API_ERROR_CODES,
  MAX_FEEDBACK_CHARS,
  REFUSAL_CODES,
  SERVER_ERROR_CODES,
  actionRequestSchema,
  apiErrorSchema,
  issueSummarySchema,
  serverEventSchema
} from "./api.contract";

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
    }
  ])("accepts $input", ({ input, expected }) => {
    expect(actionRequestSchema.parse(input)).toEqual(expected);
  });

  it.each([
    { name: "an unknown action", input: { action: "merge" } },
    { name: "an extra field", input: { action: "approve", worktree: "/tmp" } },
    { name: "empty feedback", input: { action: "feedback", to: "build", text: "   " } },
    { name: "feedback to a gate", input: { action: "feedback", to: "pr-review", text: "x" } },
    {
      name: "feedback past the limit",
      input: { action: "feedback", to: "plan", text: "x".repeat(MAX_FEEDBACK_CHARS + 1) }
    },
    { name: "continue from a gate", input: { action: "continue", from: "plan-gate" } },
    { name: "a real ship without confirm", input: { action: "ship", confirm: false } },
    { name: "a ship without confirm field", input: { action: "ship" } },
    { name: "a string where a boolean belongs", input: { action: "remove", force: "yes" } }
  ])("rejects $name", ({ input }) => {
    expect(actionRequestSchema.safeParse(input).success).toBe(false);
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
    needsYouReason: null,
    resumeStage: null,
    prUrl: null,
    contract: { found: 6, total: 6 },
    stageEnteredAt: "2026-03-01T10:00:00.000Z",
    progress: ["passed", "passed", "passed", "running", "idle", "idle", "idle", "idle"],
    currentNode: "build",
    busy: false,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z"
  };

  it("carries the board facts: contract, stage time, and one status for each flow node", () => {
    expect(issueSummarySchema.parse(summary)).toEqual(summary);
  });

  it("rejects a progress list that does not cover every flow node", () => {
    expect(
      issueSummarySchema.safeParse({ ...summary, progress: summary.progress.slice(1) }).success
    ).toBe(false);
  });
});
