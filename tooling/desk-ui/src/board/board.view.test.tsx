import type { IssueSummary } from "@repo/desk/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DONE_LIMIT } from "./board.view";
import { DeskApiError, type DeskApi } from "../api/api.client";
import { DeskApp } from "../desk.app";
import { UNDO_WINDOW_MS } from "../shell/shell.undo";
import { fakeApi, makeState, makeSummary, renderDesk } from "../test/test.render";

const summary = (
  issueNumber: number,
  patch: Partial<ReturnType<typeof makeState>>,
  extra: Partial<Extract<IssueSummary, { readable: true }>> = {}
): IssueSummary => ({ ...makeSummary(makeState({ issueNumber, ...patch })), ...extra });

const BOARD: IssueSummary[] = [
  summary(
    3,
    { stage: "needs-you", status: "waiting", resumeStage: "check" },
    { title: "Fix the flaky check", needsYouReason: "Two checks failed the same way:\nFAIL x" }
  ),
  summary(42, { stage: "plan-gate", status: "waiting" }, { title: "Add an empty state" }),
  summary(43, { stage: "pr-review", status: "waiting" }, { title: "Explain the verdict" }),
  summary(44, { stage: "build", status: "running" }, { title: "Show loop counts" }),
  summary(
    45,
    { stage: "shipped", status: "done" },
    { title: "Open the PR", prUrl: "https://github.com/o/r/pull/9" }
  )
];

const show = (issues: IssueSummary[] = BOARD, api: Partial<DeskApi> = {}) =>
  renderDesk(<DeskApp />, fakeApi({ issues: () => Promise.resolve(issues), ...api }));

const column = (name: RegExp) => screen.getByRole("region", { name });

/** The board in its Columns layout: the choice is kept, so each test starts from Your turn. */
const showColumns = async (issues: IssueSummary[] = BOARD, api: Partial<DeskApi> = {}) => {
  show(issues, api);
  await userEvent.click(await screen.findByRole("button", { name: "Columns" }));
};

afterEach(() => {
  localStorage.clear();
});

describe("BoardView columns", () => {
  it("shows four columns with a count, and each issue in one of them", async () => {
    await showColumns();
    await screen.findByRole("link", { name: /#42/ });
    for (const [name, count] of [
      [/^Needs you/, "1"],
      [/^Waiting for you/, "2"],
      [/^Running/, "1"],
      [/^Done/, "1"]
    ] as const) {
      expect(within(column(name)).getByRole("heading", { level: 2 }).textContent).toContain(count);
    }
    expect(within(column(/^Waiting for you/)).getByText("#42")).toBeTruthy();
    expect(within(column(/^Done/)).getByText("#45")).toBeTruthy();
  });

  it("shows one chip that joins stage and state, and the progress in words", async () => {
    await showColumns();
    const waiting = await screen.findByRole("region", { name: /^Waiting for you/ });
    expect(
      within(waiting).getByText("Plan approval · waiting for you", { selector: ".desk-chip" })
    ).toBeTruthy();
    expect(
      within(waiting).getByRole("img", { name: "Stage 3 of 9: Plan approval (Waiting for you)" })
    ).toBeTruthy();
    expect(
      within(column(/^Running/)).getByText("Build · running", { selector: ".desk-chip" })
    ).toBeTruthy();
    expect(
      within(column(/^Needs you/)).getByText("Needs you", { selector: ".desk-chip" })
    ).toBeTruthy();
    expect(within(column(/^Done/)).getByText("Shipped", { selector: ".desk-chip" })).toBeTruthy();
  });

  it("offers the next step on each card", async () => {
    await showColumns();
    await screen.findByRole("link", { name: /#42/ });
    expect(
      within(column(/^Waiting for you/))
        .getByRole("link", { name: "Review plan" })
        .getAttribute("href")
    ).toBe("?issue=42");
    expect(
      within(column(/^Waiting for you/))
        .getByRole("link", { name: "Review and ship" })
        .getAttribute("href")
    ).toBe("?issue=43");
    expect(within(column(/^Running/)).getByText("Working")).toBeTruthy();
    expect(
      within(column(/^Done/)).getByRole("link", { name: "Open PR" }).getAttribute("href")
    ).toBe("https://github.com/o/r/pull/9");
    // The reason never ends on a dangling colon: the next line completes it.
    expect(
      within(column(/^Needs you/)).getByText("Two checks failed the same way: FAIL x")
    ).toBeTruthy();
  });

  it("continues an issue from its card after the undo window and reports the result as a toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const send = vi.fn<DeskApi["act"]>(() =>
        Promise.resolve({ status: "accepted", action: "continue", issueNumber: 3 })
      );
      await showColumns(BOARD, { act: send });
      const needsYou = await screen.findByRole("region", { name: /^Needs you/ });
      await userEvent.click(within(needsYou).getByRole("button", { name: "Continue" }));
      expect(await screen.findByText("#3 · The run will continue.")).toBeTruthy();
      expect(send).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
      expect(send).toHaveBeenCalledWith(3, { action: "continue" });
      expect(
        await screen.findByText("#3 · Continued. The run goes on in the background.")
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables Continue while the engine runs an action of the issue", async () => {
    await showColumns([
      { ...summary(3, { stage: "needs-you", status: "waiting" }), busy: true } as IssueSummary
    ]);
    const needsYou = await screen.findByRole("region", { name: /^Needs you/ });
    expect(within(needsYou).getByRole("button", { name: "Continue" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("shows calm text in an empty column", async () => {
    await showColumns([summary(42, { stage: "plan-gate", status: "waiting" })]);
    await screen.findByRole("link", { name: /#42/ });
    expect(within(column(/^Running/)).getByText("No agent works right now.")).toBeTruthy();
  });

  it("shows the newest finished issues first and the rest on request", async () => {
    const done = Array.from({ length: DONE_LIMIT + 2 }, (_, index) =>
      summary(
        200 + index,
        { stage: "shipped", status: "done" },
        { updatedAt: `2026-03-01T10:${String(10 + index)}:00.000Z` }
      )
    );
    await showColumns(done);
    const finished = await screen.findByRole("region", { name: /^Done/ });
    expect(within(finished).getAllByRole("listitem")).toHaveLength(DONE_LIMIT);
    await userEvent.click(
      within(finished).getByRole("button", { name: `Show all ${done.length}` })
    );
    expect(within(finished).getAllByRole("listitem")).toHaveLength(done.length);
  });

  it("explains how to start when the board is empty", async () => {
    show([]);
    expect(await screen.findByRole("heading", { name: "No issues on the desk yet" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Start your first issue" }));
    expect(await screen.findByRole("dialog", { name: "Start an issue" })).toBeTruthy();
  });
});

describe("BoardView search", () => {
  it("filters by number or title, and clears", async () => {
    await showColumns();
    await screen.findByRole("link", { name: /#42/ });
    const box = screen.getByRole("searchbox", { name: "Search issues" });
    await userEvent.type(box, "#43");
    await waitFor(() => expect(screen.queryByRole("link", { name: /#42/ })).toBeNull());
    expect(screen.getByRole("link", { name: /#43/ })).toBeTruthy();
    expect(within(column(/^Running/)).getByText("No issue here matches the search.")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    await screen.findByRole("link", { name: /#42/ });

    await userEvent.type(box, "loop COUNTS");
    await waitFor(() => expect(screen.queryByRole("link", { name: /#43/ })).toBeNull());
    expect(screen.getByRole("link", { name: /#44/ })).toBeTruthy();
  });
});

const plan = (
  issueNumber: number,
  planRisk: "low" | "medium" | "high" | null,
  stageEnteredAt: string
): IssueSummary =>
  summary(
    issueNumber,
    { stage: "plan-gate", status: "waiting" },
    { title: `Plan ${String(issueNumber)}`, planRisk, stageEnteredAt }
  );

const PLANS: IssueSummary[] = [
  plan(61, "high", "2026-03-01T09:00:00.000Z"),
  plan(62, "low", "2026-03-01T09:10:00.000Z"),
  plan(63, "medium", "2026-03-01T09:20:00.000Z"),
  plan(64, "low", "2026-03-01T09:30:00.000Z")
];

const accepted = () =>
  vi.fn<DeskApi["act"]>((issueNumber) =>
    Promise.resolve({ status: "accepted", action: "approve", issueNumber })
  );

const rowOf = (issueNumber: number): HTMLElement => {
  const row = screen
    .getByRole("link", { name: new RegExp(`^#${String(issueNumber)} `) })
    .closest("li");
  if (row === null) throw new Error(`No row for #${String(issueNumber)}`);
  return row;
};

describe("BoardView Your turn", () => {
  it("puts stopped issues under Needs you, gates under Your decisions, and marks only the first row next up", async () => {
    show();
    const needsYou = await screen.findByRole("region", { name: /^Needs you/ });
    const decisions = screen.getByRole("region", { name: /^Your decisions/ });
    expect(within(needsYou).getAllByRole("listitem")).toHaveLength(1);
    expect(within(needsYou).getByRole("link", { name: /^#3 / })).toBeTruthy();
    expect(within(decisions).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText("Next up")).toHaveLength(1);
    expect(within(rowOf(3)).getByText("Next up")).toBeTruthy();
    // Running and finished issues stay out of the inbox, in the side list.
    expect(screen.getByRole("heading", { name: "Your turn · 3", level: 1 })).toBeTruthy();
    expect(within(rowOf(44)).queryByText("Next up")).toBeNull();
  });

  it("offers a quick approve only on low-risk plans and flags a high-risk one", async () => {
    show(PLANS);
    await screen.findByRole("region", { name: /^Your decisions/ });
    expect(screen.getAllByRole("button", { name: /^Approve the plan of/ })).toHaveLength(2);
    expect(within(rowOf(62)).getByRole("button", { name: "Approve the plan of #62" })).toBeTruthy();
    expect(within(rowOf(63)).queryByRole("button", { name: /^Approve the plan/ })).toBeNull();
    expect(within(rowOf(61)).getByText("High risk")).toBeTruthy();
    expect(within(rowOf(62)).queryByText("High risk")).toBeNull();
  });

  it("sends a quick approve after the undo window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const send = accepted();
      show(PLANS, { act: send });
      await screen.findByRole("region", { name: /^Your decisions/ });
      await userEvent.click(screen.getByRole("button", { name: "Approve the plan of #62" }));
      expect(await screen.findByText("#62 · The plan will be approved.")).toBeTruthy();
      expect(send).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
      expect(send.mock.calls).toEqual([[62, { action: "approve" }]]);
      expect(await screen.findByText("#62 · Plan approved. The build started.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers the batch only for more than one low-risk plan", async () => {
    show(PLANS.slice(0, 3));
    await screen.findByRole("region", { name: /^Your decisions/ });
    expect(screen.queryByRole("button", { name: /low-risk plans…$/ })).toBeNull();
  });

  it("approves every low-risk plan in one undoable batch, one after another", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const send = accepted();
      show(PLANS, { act: send });
      await userEvent.click(
        await screen.findByRole("button", { name: "Approve 2 low-risk plans…" })
      );
      const dialog = await screen.findByRole("dialog", { name: "Approve 2 low-risk plans?" });
      expect(within(dialog).getByText("#62 Plan 62")).toBeTruthy();
      expect(within(dialog).queryByText("#61 Plan 61")).toBeNull();
      await userEvent.click(within(dialog).getByRole("button", { name: "Approve 2 plans" }));

      expect(await screen.findByText("#62, #64 · 2 low-risk plans will be approved.")).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
      expect(send.mock.calls).toEqual([
        [62, { action: "approve" }],
        [64, { action: "approve" }]
      ]);
      expect(await screen.findByText("Plans approved: #62, #64. The builds started.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends nothing when the batch is undone", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const send = accepted();
      show(PLANS, { act: send });
      await userEvent.click(
        await screen.findByRole("button", { name: "Approve 2 low-risk plans…" })
      );
      const dialog = await screen.findByRole("dialog", { name: "Approve 2 low-risk plans?" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Approve 2 plans" }));
      await screen.findByText("#62, #64 · 2 low-risk plans will be approved.");
      await userEvent.click(screen.getByRole("button", { name: "Undo" }));
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
      expect(send).not.toHaveBeenCalled();
      expect(screen.getByText("Undone. Nothing ran.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("names the plans the batch could not approve", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const send = vi.fn<DeskApi["act"]>((issueNumber) =>
        issueNumber === 64
          ? Promise.reject(new DeskApiError("leased", 409, "Already running."))
          : Promise.resolve({ status: "accepted", action: "approve", issueNumber })
      );
      show(PLANS, { act: send });
      await userEvent.click(
        await screen.findByRole("button", { name: "Approve 2 low-risk plans…" })
      );
      const dialog = await screen.findByRole("dialog", { name: "Approve 2 low-risk plans?" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Approve 2 plans" }));
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
      expect(await screen.findByText("1 of 2 plans were not approved: #64.")).toBeTruthy();
      expect(screen.getByText("Already running.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("folds the finished issues behind Show, with a summary line", async () => {
    show();
    const done = await screen.findByRole("region", { name: /^Done/ });
    expect(within(done).getByText("1 shipped, 0 cancelled")).toBeTruthy();
    expect(within(done).queryByRole("link", { name: /#45/ })).toBeNull();
    await userEvent.click(within(done).getByRole("button", { name: "Show" }));
    expect(within(done).getByRole("link", { name: /#45/ })).toBeTruthy();
  });
});

describe("BoardView filters", () => {
  it("shows filters only in Columns, hides the ones with no match, and filters the columns", async () => {
    show();
    await screen.findByRole("region", { name: /^Needs you/ });
    expect(screen.queryByRole("group", { name: "Filter" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Columns" }));
    const filters = screen.getByRole("group", { name: "Filter" });
    expect(
      within(filters)
        .getAllByRole("button")
        .map((chip) => chip.textContent)
    ).toEqual(["All 5", "Needs you 1", "Waiting for you 2", "Running 1"]);
    await userEvent.click(within(filters).getByRole("button", { name: "Running 1" }));
    expect(within(column(/^Running/)).getByRole("link", { name: /#44/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /#42/ })).toBeNull();
  });
});

describe("Start issue dialog", () => {
  it("validates the number, announces the problem, and starts with the override", async () => {
    const act = vi.fn<DeskApi["act"]>(() =>
      Promise.resolve({ status: "accepted", action: "start", issueNumber: 500 })
    );
    show(BOARD, { act });
    await userEvent.click(await screen.findByRole("button", { name: "Start issue" }));
    const dialog = await screen.findByRole("dialog", { name: "Start an issue" });

    await userEvent.type(within(dialog).getByRole("textbox", { name: "Issue number" }), "abc");
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Enter a positive whole number.");
    expect(act).not.toHaveBeenCalled();

    const number = within(dialog).getByRole("textbox", { name: "Issue number" });
    await userEvent.clear(number);
    await userEvent.type(number, "500");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /own authority/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));

    expect(act).toHaveBeenCalledWith(500, { action: "start", override: true });
    expect(await screen.findByText(/^#500 · Started\. It runs in the background\./)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog open and shows a refusal as a toast with the engine's reason", async () => {
    const act = vi.fn<DeskApi["act"]>(() =>
      Promise.reject(new DeskApiError("intake-refused", 409, "Issue #404 is closed."))
    );
    show(BOARD, { act });
    await userEvent.click(await screen.findByRole("button", { name: "Start issue" }));
    const dialog = await screen.findByRole("dialog", { name: "Start an issue" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Issue number" }), "404");
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));

    expect(
      await screen.findByText("#404 · Intake refused this issue. The reason is below.")
    ).toBeTruthy();
    expect(screen.getByText("Issue #404 is closed.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Start an issue" })).toBeTruthy();
  });
});
