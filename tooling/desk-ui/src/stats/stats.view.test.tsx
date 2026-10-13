import type { RunStats } from "@repo/desk/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StatsView } from "./stats.view";
import { DeskApiError } from "../api/api.client";
import { fakeApi, renderDesk } from "../test/test.render";

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
      meanEditCalls: 4.25
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
      meanEditCalls: 0
    }
  ],
  issues: [
    { issue: 12, stage: "pr-review", loops: { check: 1, review: 0 }, runs: 5, totalCostUsd: 6 },
    { issue: 9, stage: null, loops: null, runs: 1, totalCostUsd: null }
  ],
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
      fakeApi({ stats: () => Promise.resolve({ groups: [], issues: [], invalidLines: 0 }) })
    );
    expect(await screen.findByText(/No agent runs recorded yet/)).toBeTruthy();
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
