import { describe, expect, it } from "vitest";

import { issueStateSchema, type IssueState } from "./issue-state.contract";

const valid = (): IssueState => ({
  schemaVersion: 1,
  issueNumber: 12,
  stage: "plan-gate",
  status: "waiting",
  resumeStage: null,
  branch: "KAINE-12-feat-example",
  worktreePath: "/work/KAINE-12",
  sessions: { planner: "session-a" },
  loops: { check: 0, review: 1 },
  lastCheckFingerprint: null,
  history: [{ at: "2026-10-07T10:00:00Z", stage: "plan", event: "complete", note: "ok" }],
  authorization: {
    actor: "owner",
    labeledAt: "2026-10-07T09:00:00Z",
    contentFingerprint: "sha256:abc",
    override: false
  },
  createdAt: "2026-10-07T09:00:00Z",
  updatedAt: "2026-10-07T10:00:00Z"
});

describe("issue state contract", () => {
  it("round-trips a valid state", () => {
    expect(issueStateSchema.parse(valid())).toEqual(valid());
  });

  it("accepts a fresh issue with no branch, sessions, or authorization yet", () => {
    const fresh: IssueState = {
      ...valid(),
      stage: "intake",
      status: "idle",
      branch: null,
      worktreePath: null,
      sessions: {},
      history: [],
      authorization: null
    };
    expect(issueStateSchema.safeParse(fresh).success).toBe(true);
  });

  it.each([
    ["an unknown schema version", { schemaVersion: 2 }],
    ["an unknown stage", { stage: "test" }],
    ["an unknown status", { status: "error" }],
    ["a non-positive issue number", { issueNumber: 0 }],
    ["a negative loop counter", { loops: { check: -1, review: 0 } }],
    ["a malformed timestamp", { createdAt: "yesterday" }],
    ["an unknown key", { surprise: true }],
    [
      "an empty history event name",
      { history: [{ at: "2026-10-07T10:00:00Z", stage: "plan", event: "" }] }
    ],
    [
      "authorization without an override flag",
      { authorization: { actor: "o", labeledAt: "2026-10-07T09:00:00Z", contentFingerprint: "x" } }
    ]
  ])("rejects %s", (_name, patch) => {
    expect(issueStateSchema.safeParse({ ...valid(), ...patch }).success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const withoutBranch = Object.fromEntries(
      Object.entries(valid()).filter(([key]) => key !== "branch")
    );
    expect(issueStateSchema.safeParse(withoutBranch).success).toBe(false);
  });

  it("reads a Phase 1 file that has none of the Phase 2 fields", () => {
    const parsed = issueStateSchema.parse(valid());
    expect(parsed.baseSha).toBeUndefined();
    expect(parsed.activeProcess).toBeUndefined();
    expect(parsed.pendingFeedback).toBeUndefined();
  });

  it("round-trips the Phase 2 fields", () => {
    const phase2: IssueState = {
      ...valid(),
      baseSha: "a".repeat(40),
      activeProcess: {
        pid: 4242,
        role: "builder",
        processStart: "Tue Oct  7 10:00:00 2026",
        startedAt: "2026-10-07T10:00:00Z"
      },
      pendingFeedback: { target: "build", source: "check", text: "pnpm check failed" }
    };
    expect(issueStateSchema.parse(phase2)).toEqual(phase2);
  });

  it.each([
    ["a short base commit", { baseSha: "abc123" }],
    [
      "a zero pid",
      {
        activeProcess: {
          pid: 0,
          role: "builder",
          processStart: null,
          startedAt: "2026-10-07T10:00:00Z"
        }
      }
    ],
    [
      "an unknown role",
      {
        activeProcess: {
          pid: 3,
          role: "intake",
          processStart: null,
          startedAt: "2026-10-07T10:00:00Z"
        }
      }
    ],
    ["empty feedback text", { pendingFeedback: { target: "build", source: "human", text: "" } }],
    [
      "an unknown feedback target",
      { pendingFeedback: { target: "ship", source: "human", text: "x" } }
    ]
  ])("rejects %s", (_name, patch) => {
    expect(issueStateSchema.safeParse({ ...valid(), ...patch }).success).toBe(false);
  });
});
