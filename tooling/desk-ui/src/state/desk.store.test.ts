import type { IssueSummary, LogEntry, Stage } from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import { LOG_CAPACITY, deskReducer, initialDeskState, mergeLog, revisionOf } from "./desk.store";

const summary = (
  issueNumber: number,
  updatedAt: string,
  stage: Stage = "plan-gate"
): IssueSummary => ({
  readable: true,
  issueNumber,
  title: `Issue ${String(issueNumber)}`,
  url: null,
  labels: [],
  stage,
  status: "waiting",
  branch: null,
  loops: { check: 0, review: 0 },
  needsYouReason: null,
  resumeStage: null,
  prUrl: null,
  contract: null,
  stageEnteredAt: null,
  progress: ["passed", "passed", "waiting", "idle", "idle", "idle", "idle", "idle"],
  currentNode: "plan-gate",
  busy: false,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt
});

const entry = (seq: number, issueNumber = 7): LogEntry => ({
  seq,
  at: "2026-03-01T10:00:00.000Z",
  issueNumber,
  kind: "log",
  text: `line ${String(seq)}`
});

describe("deskReducer", () => {
  it("replaces the issue list on load and marks the session ready", () => {
    const state = deskReducer(initialDeskState, {
      type: "issues-loaded",
      issues: [summary(1, "2026-03-01T10:00:00.000Z"), summary(2, "2026-03-01T10:00:00.000Z")]
    });
    expect(Object.keys(state.issues)).toEqual(["1", "2"]);
    expect(state).toMatchObject({ issuesLoaded: true, session: "ready" });
  });

  it("applies an update event keyed by issue number", () => {
    const loaded = deskReducer(initialDeskState, {
      type: "issues-loaded",
      issues: [summary(1, "2026-03-01T10:00:00.000Z")]
    });
    const next = deskReducer(loaded, {
      type: "server-event",
      event: { type: "issue-updated", summary: summary(1, "2026-03-01T11:00:00.000Z", "pr-review") }
    });
    expect(next.issues[1]).toMatchObject({ stage: "pr-review" });
  });

  it("keeps the newer summary when a late reload carries an older one", () => {
    const newer = deskReducer(initialDeskState, {
      type: "server-event",
      event: { type: "issue-updated", summary: summary(1, "2026-03-01T12:00:00.000Z", "pr-review") }
    });
    const reloaded = deskReducer(newer, {
      type: "issues-loaded",
      issues: [summary(1, "2026-03-01T10:00:00.000Z")]
    });
    expect(reloaded.issues[1]).toMatchObject({ stage: "pr-review" });
  });

  it("drops an issue that the server removed, with its detail, log, and result", () => {
    let state = deskReducer(initialDeskState, {
      type: "issues-loaded",
      issues: [summary(1, "2026-03-01T10:00:00.000Z")]
    });
    state = deskReducer(state, { type: "logs-loaded", issueNumber: 1, entries: [entry(1, 1)] });
    state = deskReducer(state, {
      type: "server-event",
      event: {
        type: "action-result",
        issueNumber: 1,
        action: "approve",
        outcome: { stop: "gate", stage: "pr-review", message: null },
        error: null
      }
    });
    state = deskReducer(state, {
      type: "server-event",
      event: { type: "issue-removed", issueNumber: 1 }
    });
    expect(state.issues).toEqual({});
    expect(state.logs).toEqual({});
    expect(state.notes).toEqual({});
  });

  it("numbers action results so a page can tell a new one from an old one", () => {
    const event = (message: string) =>
      ({
        type: "server-event",
        event: {
          type: "action-result",
          issueNumber: 3,
          action: "ship",
          outcome: { stop: "gate", stage: null, message },
          error: null
        }
      }) as const;
    const once = deskReducer(initialDeskState, event("a"));
    const twice = deskReducer(once, event("b"));
    expect([once.notes[3]?.seq, twice.notes[3]?.seq]).toEqual([1, 2]);
  });

  it("changes the revision when the summary changes", () => {
    expect(revisionOf(summary(1, "a"))).not.toBe(revisionOf(summary(1, "b")));
  });
});

describe("mergeLog", () => {
  it("sorts, removes duplicates, and keeps the newest entries", () => {
    expect(mergeLog([entry(2), entry(1)], [entry(2), entry(3)]).map((item) => item.seq)).toEqual([
      1, 2, 3
    ]);
    const many = Array.from({ length: LOG_CAPACITY + 5 }, (_, index) => entry(index + 1));
    const merged = mergeLog([], many);
    expect(merged).toHaveLength(LOG_CAPACITY);
    expect(merged[0]?.seq).toBe(6);
  });
});
