import { NODE_STATUSES, type IssueSummary } from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import {
  NODE_TONE,
  appearanceOf,
  canCancel,
  gateModeOf,
  issueStatusOf,
  nodeStatusKey,
  reasonExcerpt,
  toneClass,
  type IssueStatus
} from "./status.model";
import { makeState, makeSummary } from "../test/test.render";

type Patch = Partial<ReturnType<typeof makeState>>;
const summaryOf = (patch: Patch, busy = false, prUrl: string | null = null) => ({
  ...makeSummary(makeState(patch), busy),
  prUrl
});
const UNREADABLE: IssueSummary = {
  readable: false,
  issueNumber: 9,
  reason: "invalid-json",
  detail: "x",
  busy: false
};

describe("issueStatusOf", () => {
  it.each<[string, IssueSummary, Omit<IssueStatus, "gateMode">]>([
    [
      "an unreadable issue",
      UNREADABLE,
      {
        group: "needs-you",
        tone: "danger",
        label: { kind: "key", key: "desk.chip.unreadable" },
        primaryAction: "open"
      }
    ],
    [
      "a stop that needs the engineer",
      summaryOf({ stage: "needs-you", status: "waiting" }),
      {
        group: "needs-you",
        tone: "danger",
        label: { kind: "key", key: "desk.stage.needs-you" },
        primaryAction: "continue"
      }
    ],
    [
      "a failed stage",
      summaryOf({ stage: "build", status: "failed" }),
      {
        group: "needs-you",
        tone: "danger",
        label: { kind: "stage", stage: "build", state: "failed" },
        primaryAction: "open"
      }
    ],
    [
      "the plan gate",
      summaryOf({ stage: "plan-gate", status: "waiting" }),
      {
        group: "waiting",
        tone: "warning",
        label: { kind: "stage", stage: "plan-gate", state: "waiting-for-you" },
        primaryAction: "review-plan"
      }
    ],
    [
      "the PR review gate",
      summaryOf({ stage: "pr-review", status: "waiting" }),
      {
        group: "waiting",
        tone: "warning",
        label: { kind: "stage", stage: "pr-review", state: "waiting-for-you" },
        primaryAction: "review-ship"
      }
    ],
    [
      "a gate whose action still runs",
      summaryOf({ stage: "plan-gate", status: "waiting" }, true),
      {
        group: "running",
        tone: "information",
        label: { kind: "stage", stage: "plan-gate", state: "working" },
        primaryAction: "working"
      }
    ],
    [
      "a running build",
      summaryOf({ stage: "build", status: "running" }),
      {
        group: "running",
        tone: "information",
        label: { kind: "stage", stage: "build", state: "running" },
        primaryAction: "working"
      }
    ],
    [
      "a queued intake",
      summaryOf({ stage: "intake", status: "queued" }),
      {
        group: "running",
        tone: "information",
        label: { kind: "stage", stage: "intake", state: "queued" },
        primaryAction: "working"
      }
    ],
    [
      "an idle stage",
      summaryOf({ stage: "check", status: "idle" }),
      {
        group: "running",
        tone: "neutral",
        label: { kind: "stage", stage: "check", state: "idle" },
        primaryAction: "open"
      }
    ],
    [
      "a shipped issue with its PR",
      summaryOf({ stage: "shipped", status: "done" }, false, "https://github.com/o/r/pull/1"),
      {
        group: "done",
        tone: "success",
        label: { kind: "key", key: "desk.stage.shipped" },
        primaryAction: "open-pr"
      }
    ],
    [
      "a shipped issue without a PR link",
      summaryOf({ stage: "shipped", status: "done" }),
      {
        group: "done",
        tone: "success",
        label: { kind: "key", key: "desk.stage.shipped" },
        primaryAction: "open"
      }
    ],
    [
      "a cancelled issue",
      summaryOf({ stage: "cancelled", status: "done" }),
      {
        group: "done",
        tone: "neutral",
        label: { kind: "key", key: "desk.stage.cancelled" },
        primaryAction: "open"
      }
    ]
  ])("maps %s", (_name, summary, expected) => {
    expect(issueStatusOf(summary)).toMatchObject(expected);
  });

  it("carries the gate mode of a readable issue, and none for an unreadable one", () => {
    expect(issueStatusOf(summaryOf({ stage: "pr-review" })).gateMode).toBe("pr-review");
    expect(issueStatusOf(UNREADABLE).gateMode).toBeNull();
  });
});

describe("gateModeOf", () => {
  it.each([
    [{ stage: "shipped", status: "done" }, false, "shipped"],
    [{ stage: "cancelled", status: "done" }, false, "cancelled"],
    [{ stage: "needs-you", status: "waiting" }, true, "needs-you"],
    [{ stage: "plan-gate", status: "waiting" }, true, "working"],
    [{ stage: "build", status: "running" }, false, "working"],
    [{ stage: "intake", status: "queued" }, false, "working"],
    [{ stage: "plan-gate", status: "waiting" }, false, "plan-gate"],
    [{ stage: "pr-review", status: "waiting" }, false, "pr-review"],
    [{ stage: "check", status: "idle" }, false, "idle"]
  ] as const)("reads %j (busy: %s) as %s", (patch, busy, mode) => {
    expect(gateModeOf(summaryOf(patch, busy))).toBe(mode);
  });

  it("offers cancel only while a run can still be stopped", () => {
    expect(canCancel("working")).toBe(true);
    expect(canCancel("shipped")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
  });
});

describe("reasonExcerpt", () => {
  it.each([
    [
      "joins a line that ends on a colon with the next non-empty line",
      "Two consecutive checks failed the same way:\n\n  FAIL apps/web/src/board.test.tsx\nmore",
      "Two consecutive checks failed the same way: FAIL apps/web/src/board.test.tsx"
    ],
    [
      "keeps only the first sentence",
      "The reviewer still asks for changes after 2 round(s). Read review.json, then continue.",
      "The reviewer still asks for changes after 2 round(s)."
    ],
    [
      "keeps a path with dots in one sentence",
      "Cannot read apps/web/src/a.test.tsx now",
      "Cannot read apps/web/src/a.test.tsx now"
    ],
    ["keeps a lone colon line when nothing follows", "Stopped because:\n\n", "Stopped because:"],
    ["skips leading blank lines", "\n\n  Stopped in 'build'.\nDetails", "Stopped in 'build'."],
    ["returns nothing for empty text", "  \n ", ""]
  ])("%s", (_name, text, expected) => {
    expect(reasonExcerpt(text)).toBe(expected);
  });
});

describe("tones", () => {
  it("maps each node status to the role the design asks for", () => {
    expect(NODE_TONE).toEqual({
      idle: "neutral",
      running: "information",
      waiting: "warning",
      passed: "success",
      looped: "warning-subtle",
      failed: "danger"
    });
    for (const status of NODE_STATUSES) {
      expect(toneClass(NODE_TONE[status])).toMatch(/^desk-tone--[a-z-]+$/);
      expect(nodeStatusKey(status)).toBe(`desk.flow.status.${status}`);
    }
  });

  it("gives every tone a badge appearance", () => {
    expect(appearanceOf("neutral")).toBe("default");
    expect(appearanceOf("warning-subtle")).toBe("warning");
    expect(appearanceOf("danger")).toBe("danger");
  });
});
