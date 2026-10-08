import type { IssueSummary } from "@repo/desk/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DONE_LIMIT } from "./board.view";
import { DeskApiError, type DeskApi } from "../api/api.client";
import { DeskApp } from "../desk.app";
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

describe("BoardView columns", () => {
  it("shows four columns with a count, and each issue in one of them", async () => {
    show();
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
    show();
    const waiting = await screen.findByRole("region", { name: /^Waiting for you/ });
    expect(
      within(waiting).getByText("Plan approval · waiting for you", { selector: ".desk-chip" })
    ).toBeTruthy();
    expect(
      within(waiting).getByRole("img", { name: "Stage 3 of 8: Plan approval (Waiting for you)" })
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
    show();
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

  it("continues an issue from its card and reports the result as a toast", async () => {
    const act = vi.fn<DeskApi["act"]>(() =>
      Promise.resolve({ status: "accepted", action: "continue", issueNumber: 3 })
    );
    show(BOARD, { act });
    const needsYou = await screen.findByRole("region", { name: /^Needs you/ });
    await userEvent.click(within(needsYou).getByRole("button", { name: "Continue" }));
    expect(act).toHaveBeenCalledWith(3, { action: "continue" });
    expect(
      await screen.findByText("#3 · Continued. The run goes on in the background.")
    ).toBeTruthy();
  });

  it("disables Continue while the engine runs an action of the issue", async () => {
    show([
      { ...summary(3, { stage: "needs-you", status: "waiting" }), busy: true } as IssueSummary
    ]);
    const needsYou = await screen.findByRole("region", { name: /^Needs you/ });
    expect(within(needsYou).getByRole("button", { name: "Continue" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("shows calm text in an empty column", async () => {
    show([summary(42, { stage: "plan-gate", status: "waiting" })]);
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
    show(done);
    const finished = await screen.findByRole("region", { name: /^Done/ });
    expect(within(finished).getAllByRole("listitem")).toHaveLength(DONE_LIMIT);
    await userEvent.click(
      within(finished).getByRole("button", { name: `Show all ${done.length}` })
    );
    expect(within(finished).getAllByRole("listitem")).toHaveLength(done.length);
  });

  it("explains how to start when the board is empty", async () => {
    show([]);
    expect(await screen.findByRole("heading", { name: "No issues yet" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Start issue" })).toHaveLength(2);
  });
});

describe("BoardView search", () => {
  it("filters by number or title, and clears", async () => {
    show();
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

  it("focuses the search with the slash key", async () => {
    show();
    await screen.findByRole("link", { name: /#42/ });
    await userEvent.keyboard("/");
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search issues" }));
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
