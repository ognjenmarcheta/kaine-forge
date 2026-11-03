import type { IssueSummary, JobState } from "@repo/desk/contracts";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type DeskApi } from "../api/api.client";
import { DeskApp } from "../desk.app";
import { UNDO_WINDOW_MS } from "../shell/shell.undo";
import { fakeApi, makeState, makeSummary, renderDesk } from "../test/test.render";

const summary = (
  issueNumber: number,
  patch: Partial<ReturnType<typeof makeState>>,
  extra: Partial<Extract<IssueSummary, { readable: true }>> = {}
): IssueSummary => ({ ...makeSummary(makeState({ issueNumber, ...patch })), ...extra });

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

/** A scorecard job that waits at its review gate. */
const waitingJob = (): JobState => ({
  schema: 1,
  id: 7,
  kind: "scorecard",
  createdAt: "2026-11-02T12:00:00.000Z",
  updatedAt: "2026-11-02T12:05:00.000Z",
  input: { note: "", model: "opus", budgetUsd: 15, minutes: 60 },
  status: "waiting",
  stage: "review",
  stop: null,
  branch: null,
  worktree: null,
  spentUsd: 1,
  feedback: [],
  history: [],
  result: null,
  screen: null,
  component: null,
  audit: null,
  approvedIssues: [],
  filedIssues: [],
  pr: null
});

const WORK: IssueSummary[] = [
  summary(
    3,
    { stage: "needs-you", status: "waiting", resumeStage: "check" },
    {
      title: "Fix the flaky check",
      needsYouCode: "same-failure",
      needsYouReason: "Two checks failed."
    }
  ),
  summary(42, { stage: "plan-gate", status: "waiting" }, { title: "Add an empty state" }),
  summary(
    46,
    { stage: "pr-open", status: "waiting" },
    { title: "Add CSV export", prUrl: "https://github.com/o/r/pull/9" }
  ),
  summary(44, { stage: "build", status: "running" }, { title: "Show loop counts" }),
  summary(
    45,
    { stage: "shipped", status: "done" },
    { title: "Open the PR", prUrl: "https://github.com/o/r/pull/8" }
  )
];

const PLANS: IssueSummary[] = [
  plan(61, "high", "2026-03-01T09:00:00.000Z"),
  plan(62, "low", "2026-03-01T09:10:00.000Z"),
  plan(63, "medium", "2026-03-01T09:20:00.000Z"),
  plan(64, "low", "2026-03-01T09:30:00.000Z")
];

const show = (issues: IssueSummary[], api: Partial<DeskApi> = {}) =>
  renderDesk(<DeskApp />, fakeApi({ issues: () => Promise.resolve(issues), ...api }));

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

afterEach(() => {
  localStorage.clear();
});

describe("InboxView", () => {
  it("groups what waits on you as Stopped, Your decision, and Merge on GitHub, with one next up", async () => {
    show(WORK, { jobs: () => Promise.resolve([waitingJob()]) });
    const stopped = await screen.findByRole("region", { name: "Stopped" });
    const decide = screen.getByRole("region", { name: "Your decision" });
    const github = screen.getByRole("region", { name: "Merge on GitHub" });
    expect(within(stopped).getByRole("link", { name: /^#3 / })).toBeTruthy();
    // A desk job at its gate waits on you like an issue does.
    expect(within(decide).getAllByRole("listitem")).toHaveLength(2);
    expect(within(decide).getByText("Job · scorecard")).toBeTruthy();
    expect(within(github).getByRole("link", { name: /^#46 / })).toBeTruthy();
    // The stop names its reason from the engine's code.
    expect(within(rowOf(3)).getByText("Stopped · same failure twice")).toBeTruthy();
    expect(screen.getAllByText("Next up")).toHaveLength(1);
    expect(within(rowOf(3)).getByText("Next up")).toBeTruthy();
    // Running and finished work stays out of the groups, in the side panels.
    expect(screen.getByRole("heading", { name: "Your turn 4", level: 1 })).toBeTruthy();
    const side = screen.getByRole("complementary", { name: "Running and finished work" });
    expect(within(side).getByRole("link", { name: /^#44 / })).toBeTruthy();
    expect(within(side).getByRole("link", { name: /^#45 / })).toBeTruthy();
  });

  it("offers a quick approve only on low-risk plans and flags a high-risk one", async () => {
    show(PLANS);
    await screen.findByRole("region", { name: "Your decision" });
    expect(screen.getAllByRole("button", { name: /^Approve the plan of/ })).toHaveLength(2);
    expect(within(rowOf(63)).queryByRole("button", { name: /^Approve the plan/ })).toBeNull();
    expect(within(rowOf(61)).getByText("High risk")).toBeTruthy();
  });

  it("sends a quick approve after the undo window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const send = accepted();
      show(PLANS, { act: send });
      await screen.findByRole("region", { name: "Your decision" });
      await userEvent.click(screen.getByRole("button", { name: "Approve the plan of #62" }));
      expect(send).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
      expect(send.mock.calls).toEqual([[62, { action: "approve" }]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("approves every low-risk plan in one undoable batch from the Your decision heading", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const send = accepted();
      show(PLANS, { act: send });
      const decide = await screen.findByRole("region", { name: "Your decision" });
      await userEvent.click(
        within(decide).getByRole("button", { name: "Approve 2 low-risk plans…" })
      );
      const dialog = await screen.findByRole("dialog", { name: "Approve 2 low-risk plans?" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Approve 2 plans" }));
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
      expect(send.mock.calls).toEqual([
        [62, { action: "approve" }],
        [64, { action: "approve" }]
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks an item New when it changed after it was last opened, and not on a first visit", async () => {
    const before = summary(
      42,
      { stage: "plan-gate", status: "waiting" },
      {
        title: "Add an empty state",
        updatedAt: "2026-03-01T10:00:00.000Z"
      }
    );
    // A first visit takes what it sees as read.
    const first = show([before]);
    await screen.findByRole("region", { name: "Your decision" });
    expect(screen.queryByText("New")).toBeNull();
    first.unmount();

    const after = { ...before, updatedAt: "2026-03-01T11:00:00.000Z" };
    show([after]);
    await screen.findByRole("region", { name: "Your decision" });
    expect(within(rowOf(42)).getByText("New")).toBeTruthy();
  });

  it("guides a first run through setup, the first issue, and its plan", async () => {
    show([]);
    const guide = await screen.findByRole("region", { name: "Get started" });
    expect(within(guide).getByText("Fix the setup")).toBeTruthy();
    await userEvent.click(within(guide).getByRole("button", { name: "Start an issue" }));
    expect(await screen.findByRole("dialog", { name: "New work" })).toBeTruthy();
  });
});
