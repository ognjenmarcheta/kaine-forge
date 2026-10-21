import type { LessonReport, RunStats } from "@repo/desk/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StatsView } from "./stats.view";
import { DeskApiError } from "../api/api.client";
import { fakeApi, renderDesk } from "../test/test.render";

/** The seven days the stats always cover, here without runs. */
const DAYS: RunStats["days"] = Array.from({ length: 7 }, (_, index) => ({
  date: `2026-10-${String(15 + index)}`,
  runs: 0,
  costUsd: null,
  shipped: 0
}));

const STATS: RunStats = {
  groups: [
    {
      role: "builder",
      provider: "claude",
      model: "opus",
      runs: 4,
      accepted: 3,
      stuck: 1,
      timeouts: 0,
      medianDurationMs: 125_000,
      meanInputTokens: 52_000,
      meanOutputTokens: 1_500,
      totalCostUsd: 6,
      meanCostUsd: 1.5,
      meanTurns: 30,
      meanEditCalls: 4.25,
      harness: null
    },
    {
      role: "reviewer",
      provider: "codex",
      model: null,
      runs: 2,
      accepted: 2,
      stuck: 0,
      timeouts: 0,
      medianDurationMs: 60_000,
      meanInputTokens: 40_000,
      meanOutputTokens: 900,
      totalCostUsd: null,
      meanCostUsd: null,
      meanTurns: null,
      meanEditCalls: 0,
      harness: null
    }
  ],
  issues: [
    { issue: 12, stage: "pr-review", loops: { check: 1, review: 0 }, runs: 5, totalCostUsd: 6 },
    { issue: 9, stage: null, loops: null, runs: 1, totalCostUsd: null }
  ],
  riskOutcomes: [],
  days: DAYS,
  invalidLines: 2
};

const cells = (row: HTMLElement): string[] =>
  Array.from(row.querySelectorAll("th, td"), (cell) => cell.textContent ?? "");

describe("StatsView", () => {
  it("shows one row per role, provider, and model, and one per issue", async () => {
    renderDesk(<StatsView />, fakeApi({ stats: () => Promise.resolve(STATS) }));

    const groups = await screen.findByRole("table", { name: "By role and model" });
    const [, builder, reviewer] = within(groups).getAllByRole("row");
    expect(builder && cells(builder)).toEqual([
      "Builder",
      "claude",
      "opus",
      "4",
      "3",
      "1",
      "0",
      "2m 5s",
      "52K",
      "1.5K",
      "30",
      "4.3",
      "$1.50",
      "$6.00"
    ]);
    // Codex reports no cost and no turns: the cells say "none", not zero.
    expect(reviewer && cells(reviewer).slice(2, 3)).toEqual(["CLI default"]);
    expect(reviewer && cells(reviewer).slice(10)).toEqual(["–None", "0.0", "–None", "–None"]);

    const issues = screen.getByRole("table", { name: "By issue" });
    expect(within(issues).getByRole("link", { name: "#12" }).getAttribute("href")).toBe(
      "?issue=12"
    );
    expect(within(issues).getByText("Removed")).toBeTruthy();
    expect(within(issues).getByText("Check 1 · review 0")).toBeTruthy();
    expect(screen.getByText(/2 line\(s\) of runs.jsonl/)).toBeTruthy();
  });

  it("explains an empty record", async () => {
    renderDesk(
      <StatsView />,
      fakeApi({
        stats: () =>
          Promise.resolve({ groups: [], issues: [], riskOutcomes: [], days: DAYS, invalidLines: 0 })
      })
    );
    expect(await screen.findByText(/No agent runs recorded yet/)).toBeTruthy();
  });

  it("lists lesson candidates with links to their issues, and shows agent text as text", async () => {
    const lessons: LessonReport = {
      candidates: [
        {
          key: "review/Correctness/Consider",
          source: "review",
          issues: [12, 15],
          occurrences: 3,
          currentOccurrences: 1,
          lastSeen: "2026-10-13T09:00:00.000Z",
          samples: [{ issue: 15, detail: "<b>No header row</b>", file: "src/export.ts" }]
        }
      ],
      belowThreshold: 4,
      minIssues: 2,
      currentRepo: null,
      promoted: [],
      invalidLines: 0
    };
    renderDesk(
      <StatsView />,
      fakeApi({
        stats: () => Promise.resolve(STATS),
        lessons: () => Promise.resolve(lessons)
      })
    );

    const table = await screen.findByRole("table", { name: "Lesson candidates" });
    const [, row] = within(table).getAllByRole("row");
    expect(row && cells(row).slice(0, 4)).toEqual([
      "review/Correctness/ConsiderReview finding",
      "#12#15",
      "3",
      "1"
    ]);
    expect(within(table).getByRole("link", { name: "#15" }).getAttribute("href")).toBe("?issue=15");
    // The sample is shown as written, never as markup.
    expect(within(table).getByText(/<b>No header row<\/b>/)).toBeTruthy();
    expect(table.querySelector("b")).toBeNull();
    expect(screen.getByText("Other kinds of problem, seen in fewer issues: 4")).toBeTruthy();
  });

  it("keeps the run tables when the lessons cannot be loaded", async () => {
    renderDesk(<StatsView />, fakeApi({ stats: () => Promise.resolve(STATS) }));

    expect(await screen.findByRole("table", { name: "By role and model" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Lesson candidates" })).toBeNull();
  });

  it("shows a failure and loads again on request", async () => {
    const stats = vi
      .fn<() => Promise<RunStats>>()
      .mockRejectedValueOnce(new DeskApiError("internal", 500, null))
      .mockResolvedValue(STATS);
    renderDesk(<StatsView />, fakeApi({ stats }));

    await userEvent.click(await screen.findByRole("button", { name: "Load again" }));

    expect(await screen.findByRole("table", { name: "By role and model" })).toBeTruthy();
  });
});
