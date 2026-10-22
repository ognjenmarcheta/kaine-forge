import type { LessonIssueDraft, LessonReport, RunStats } from "@repo/desk/contracts";
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
      agentId: "builder",
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
      // A flow agent of the owner's own, with the builder's permissions: a row of its own.
      role: "builder",
      agentId: "ui-builder",
      provider: "claude",
      model: "sonnet",
      runs: 1,
      accepted: 1,
      stuck: 0,
      timeouts: 0,
      medianDurationMs: 30_000,
      meanInputTokens: 10_000,
      meanOutputTokens: 500,
      totalCostUsd: 0.5,
      meanCostUsd: 0.5,
      meanTurns: 12,
      meanEditCalls: 2,
      harness: null
    },
    {
      role: "reviewer",
      agentId: "reviewer",
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
  it("shows one row per agent, provider, and model, and one per issue", async () => {
    renderDesk(<StatsView />, fakeApi({ stats: () => Promise.resolve(STATS) }));

    const groups = await screen.findByRole("table", { name: "By agent and model" });
    const [, builder, custom, reviewer] = within(groups).getAllByRole("row");
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
    // A built-in agent reads as its role; the owner's agent shows its own id, as it is.
    expect(custom && cells(custom).slice(0, 4)).toEqual(["ui-builder", "claude", "sonnet", "1"]);
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
      "review/Correctness/ConsiderReview findingMedium",
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

    expect(await screen.findByRole("table", { name: "By agent and model" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Lesson candidates" })).toBeNull();
  });

  it("shows a failure and loads again on request", async () => {
    const stats = vi
      .fn<() => Promise<RunStats>>()
      .mockRejectedValueOnce(new DeskApiError("internal", 500, null))
      .mockResolvedValue(STATS);
    renderDesk(<StatsView />, fakeApi({ stats }));

    await userEvent.click(await screen.findByRole("button", { name: "Load again" }));

    expect(await screen.findByRole("table", { name: "By agent and model" })).toBeTruthy();
  });

  it("sums the last seven days into cards and shows today from the last day", async () => {
    const days: RunStats["days"] = [0, 0, 1, 2, 0, 3, 1].map((runs, index) => ({
      date: `2026-10-${String(15 + index)}`,
      runs,
      costUsd: index === 2 ? 1.5 : index === 4 ? 0.25 : null,
      shipped: index === 5 ? 1 : 0
    }));
    renderDesk(<StatsView />, fakeApi({ stats: () => Promise.resolve({ ...STATS, days }) }));

    const runs = await screen.findByRole("group", { name: "Agent runs" });
    expect(within(runs).getByText("7")).toBeTruthy();
    expect(within(runs).getByText("Today: 1")).toBeTruthy();
    // A day without a reported cost is "none", not $0.00, in the total and in the words.
    const cost = screen.getByRole("group", { name: "Cost" });
    expect(within(cost).getByText("$1.75")).toBeTruthy();
    expect(within(cost).getByText("Today: None")).toBeTruthy();
    expect(
      within(cost).getByText("Per day, oldest first: None, None, $1.50, None, $0.25, None, None")
    ).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Shipped" })).getByText("1")).toBeTruthy();

    const today = screen.getByRole("region", { name: "Today" });
    expect(within(today).getByText("Agent runs: 1")).toBeTruthy();
    expect(within(today).getByText("Spent: no cost reported")).toBeTruthy();
  });

  it("shows none for a week in which no run reported a cost", async () => {
    renderDesk(<StatsView />, fakeApi({ stats: () => Promise.resolve(STATS) }));

    const cost = await screen.findByRole("group", { name: "Cost" });
    expect(within(cost).getByText("None", { selector: ".desk-sr-only" })).toBeTruthy();
    // Cost by agent sums every model of an agent; one without a cost says so instead of $0.00.
    const bars = screen.getByRole("heading", { name: "Cost by agent" }).parentElement;
    if (bars === null) throw new Error("no Cost by agent card");
    expect(
      within(bars)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Builder$6.00", "ui-builder$0.50", "ReviewerNo cost reported"]);
  });
});

const CANDIDATE = {
  key: "check/pnpm test",
  source: "check",
  issues: [12, 15],
  occurrences: 3,
  currentOccurrences: 3,
  lastSeen: "2026-10-13T09:00:00.000Z",
  samples: [{ issue: 15, detail: "expected 2 rows", file: null }]
} as const satisfies LessonReport["candidates"][number];

const LESSONS: LessonReport = {
  candidates: [CANDIDATE],
  promoted: [],
  belowThreshold: 0,
  minIssues: 2,
  currentRepo: null,
  invalidLines: 0
};

const PROMOTED: LessonReport = {
  ...LESSONS,
  candidates: [],
  promoted: [
    { key: CANDIDATE.key, at: "2026-10-13T09:00:00.000Z", note: "Added a rule", issue: null }
  ]
};

describe("StatsView lessons", () => {
  it("promotes a lesson with its note, then unpromotes it, from the server's answers", async () => {
    const lessonPromote = vi.fn(() => Promise.resolve(PROMOTED));
    const lessonUnpromote = vi.fn(() => Promise.resolve(LESSONS));
    renderDesk(
      <StatsView />,
      fakeApi({
        stats: () => Promise.resolve(STATS),
        lessons: () => Promise.resolve(LESSONS),
        lessonPromote,
        lessonUnpromote
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Promote check/pnpm test" }));
    const dialog = await screen.findByRole("dialog", { name: "Promote this lesson?" });
    await userEvent.type(within(dialog).getByLabelText("Note (optional)"), "  Added a rule  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Promote" }));

    expect(lessonPromote).toHaveBeenCalledWith("check/pnpm test", "Added a rule");
    expect(await screen.findByText("Added a rule")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Lesson candidates" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Unpromote check/pnpm test" }));

    expect(lessonUnpromote).toHaveBeenCalledWith("check/pnpm test");
    expect(await screen.findByRole("table", { name: "Lesson candidates" })).toBeTruthy();
    expect(screen.getByText("No promoted lesson yet.")).toBeTruthy();
  });

  it("opens an issue only after a yes to the exact preview, with the preview's digest", async () => {
    const draft: LessonIssueDraft = {
      key: CANDIDATE.key,
      title: "Lesson: check/pnpm test",
      body: "### Outcome\n<b>The tests</b> pass.",
      digest: "a".repeat(64)
    };
    const lessonIssue = vi.fn(() =>
      Promise.resolve({
        issue: 321,
        url: "https://github.com/owner/repo/issues/321",
        report: {
          ...LESSONS,
          candidates: [],
          promoted: [{ key: CANDIDATE.key, at: "2026-10-13T09:00:00.000Z", note: null, issue: 321 }]
        }
      })
    );
    renderDesk(
      <StatsView />,
      fakeApi({
        stats: () => Promise.resolve(STATS),
        lessons: () => Promise.resolve(LESSONS),
        lessonIssuePreview: () => Promise.resolve(draft),
        lessonIssue
      })
    );
    const turn = await screen.findByRole("button", { name: "Turn check/pnpm test into an issue" });

    // Back sends nothing.
    await userEvent.click(turn);
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Back" })
    );
    expect(lessonIssue).not.toHaveBeenCalled();

    await userEvent.click(turn);
    const dialog = await screen.findByRole("dialog", { name: "Open this issue on GitHub?" });
    expect(within(dialog).getByLabelText("Title").textContent).toBe(draft.title);
    // The body is the engine's text, shown as written and never as markup.
    expect(within(dialog).getByLabelText("Body").textContent).toBe(draft.body);
    expect(dialog.querySelector("b")).toBeNull();
    expect(lessonIssue).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Open the issue" }));

    expect(lessonIssue).toHaveBeenCalledWith(CANDIDATE.key, draft.digest);
    const links = await screen.findAllByRole("link", { name: "Open #321 on GitHub" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://github.com/owner/repo/issues/321",
      "https://github.com/owner/repo/issues/321"
    ]);
  });
});
