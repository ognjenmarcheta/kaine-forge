import { describe, expect, it } from "vitest";

import { sortDone } from "./board.side";
import { makeState, makeSummary } from "../test/test.render";

const done = (issueNumber: number, mergedAt: string | null, stageEnteredAt: string | null) => ({
  ...makeSummary(makeState({ issueNumber, stage: "shipped", status: "done" })),
  mergedAt,
  stageEnteredAt
});

describe("sortDone", () => {
  const issues = [
    // Merged first, but the desk saw it last: the merge date counts.
    done(3, "2026-11-02T08:00:00Z", "2026-11-04T10:00:00Z"),
    // Cancelled: no merge, so the time it ended counts.
    done(9, null, "2026-11-02T09:00:00Z"),
    done(5, "2026-11-02T12:00:00Z", "2026-11-02T12:01:00Z"),
    done(7, null, null)
  ];

  it("puts the newest finish first, and an issue without a date last", () => {
    expect(sortDone(issues, "recent").map((issue) => issue.issueNumber)).toEqual([5, 9, 3, 7]);
  });

  it("sorts by issue number on request", () => {
    expect(sortDone(issues, "number").map((issue) => issue.issueNumber)).toEqual([9, 7, 5, 3]);
  });
});
