import type { IssueSummary } from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import { groupIssues, matchesSearch } from "./board.grouping";
import { makeState, makeSummary } from "../test/test.render";

const issue = (
  issueNumber: number,
  patch: Partial<ReturnType<typeof makeState>>,
  updatedAt = "2026-03-01T10:00:00.000Z",
  title = "Add a thing"
): IssueSummary => ({
  ...makeSummary(makeState({ issueNumber, updatedAt, ...patch })),
  title
});

const UNREADABLE: IssueSummary = {
  readable: false,
  issueNumber: 3,
  reason: "invalid-json",
  detail: "x",
  busy: false
};

describe("groupIssues", () => {
  it("sorts each column by the latest change and puts unreadable issues first", () => {
    const groups = groupIssues([
      issue(1, { stage: "plan-gate" }, "2026-03-01T10:00:00.000Z"),
      issue(2, { stage: "plan-gate" }, "2026-03-01T12:00:00.000Z"),
      UNREADABLE,
      issue(4, { stage: "needs-you" })
    ]);
    expect(groups.waiting.map((entry) => entry.issueNumber)).toEqual([2, 1]);
    expect(groups["needs-you"].map((entry) => entry.issueNumber)).toEqual([3, 4]);
    expect(groups.running).toEqual([]);
    expect(groups.done).toEqual([]);
  });

  it("puts every issue in exactly one column", () => {
    const groups = groupIssues([
      issue(1, { stage: "build", status: "running" }),
      issue(2, { stage: "shipped", status: "done" }),
      issue(3, { stage: "cancelled", status: "done" })
    ]);
    expect(groups.running.map((entry) => entry.issueNumber)).toEqual([1]);
    expect(groups.done.map((entry) => entry.issueNumber)).toEqual([2, 3]);
  });
});

describe("matchesSearch", () => {
  const board = issue(101, {}, undefined, "Add an empty state to the board");
  it.each([
    ["", true],
    ["   ", true],
    ["101", true],
    ["#10", true],
    ["#102", false],
    ["01", false],
    ["EMPTY state", true],
    ["graph", false]
  ])("matches %j: %s", (query, expected) => {
    expect(matchesSearch(board, query)).toBe(expected);
  });

  it("finds an unreadable issue by its number only", () => {
    expect(matchesSearch(UNREADABLE, "3")).toBe(true);
    expect(matchesSearch(UNREADABLE, "invalid")).toBe(false);
  });
});
