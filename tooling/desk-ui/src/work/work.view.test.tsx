import type { GithubIssue, GithubLists, IssueSummary } from "@repo/desk/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeskApiError, type DeskApi } from "../api/api.client";
import { DeskApp } from "../desk.app";
import { fakeApi, makeState, makeSummary, renderDesk } from "../test/test.render";

const AT = "2026-03-01T10:00:00.000Z";

const summary = (
  issueNumber: number,
  patch: Partial<ReturnType<typeof makeState>>,
  extra: Partial<Extract<IssueSummary, { readable: true }>> = {}
): IssueSummary => ({ ...makeSummary(makeState({ issueNumber, ...patch })), ...extra });

const WORK: IssueSummary[] = [
  summary(
    3,
    { stage: "needs-you", status: "waiting", resumeStage: "check" },
    { title: "Fix the check" }
  ),
  summary(42, { stage: "plan-gate", status: "waiting" }, { title: "Add an empty state" }),
  summary(46, { stage: "pr-open", status: "waiting" }, { title: "Add CSV export" }),
  summary(44, { stage: "build", status: "running" }, { title: "Show loop counts" }),
  summary(45, { stage: "shipped", status: "done" }, { title: "Open the PR" })
];

const issue = (over: Partial<GithubIssue>): GithubIssue => ({
  number: 12,
  title: "Add a CSV export",
  url: "https://github.com/o/r/issues/12",
  labels: [],
  ready: false,
  contract: { found: 6, total: 6 },
  onBoard: false,
  flowId: "kaine-default",
  updatedAt: AT,
  ...over
});

const lists = (issues: GithubIssue[]): GithubLists => ({
  ok: true,
  issues,
  pulls: [],
  fetchedAt: AT
});

const show = (search: string, api: Partial<DeskApi> = {}) => {
  window.history.replaceState(null, "", search);
  return renderDesk(<DeskApp />, fakeApi({ issues: () => Promise.resolve(WORK), ...api }));
};

const rows = (): string[] =>
  within(screen.getByRole("table"))
    .getAllByRole("link")
    .map((link) => link.textContent ?? "");

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("WorkView", () => {
  it("lists every item and filters by state, hiding the filters with no match", async () => {
    show("?view=work");
    await screen.findByRole("table");
    expect(rows()).toHaveLength(5);
    const filters = screen.getByRole("group", { name: "Filter" });
    expect(within(filters).queryByRole("button", { name: /^Jobs/ })).toBeNull();
    await userEvent.click(within(filters).getByRole("button", { name: /^On GitHub/ }));
    expect(rows()).toEqual(["#46 Add CSV export"]);
    await userEvent.click(within(filters).getByRole("button", { name: /^Finished/ }));
    expect(rows()).toEqual(["#45 Open the PR"]);
  });

  it("searches by number or title", async () => {
    show("?view=work");
    await screen.findByRole("table");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search work" }), "#4");
    await waitFor(() => expect(rows()).toHaveLength(4));
    await userEvent.clear(screen.getByRole("searchbox", { name: "Search work" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search work" }), "csv");
    await waitFor(() => expect(rows()).toEqual(["#46 Add CSV export"]));
  });

  it("shows columns, with a PR to merge among the decisions", async () => {
    show("?view=work");
    await userEvent.click(await screen.findByRole("button", { name: "Columns" }));
    const decide = screen.getByRole("region", { name: "Your decision" });
    expect(within(decide).getAllByRole("article")).toHaveLength(2);
    expect(within(decide).getByRole("link", { name: /^#46 / })).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Finished" })).getByRole("link", { name: /^#45 / })
    ).toBeTruthy();
  });
});

describe("New work", () => {
  const openNewWork = async () => {
    const sidebar = await screen.findByRole("complementary", { name: "Sidebar" });
    await userEvent.click(within(sidebar).getByRole("button", { name: "New work" }));
    return screen.findByRole("dialog", { name: "New work" });
  };

  it("validates the number, announces the problem, and starts without the ready label", async () => {
    const act = vi.fn<DeskApi["act"]>(() =>
      Promise.resolve({ status: "accepted", action: "start", issueNumber: 500 })
    );
    show("/", { act });
    const dialog = await openNewWork();

    await userEvent.type(within(dialog).getByRole("textbox", { name: "Issue number" }), "abc");
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Enter a positive whole number.");
    expect(act).not.toHaveBeenCalled();

    const number = within(dialog).getByRole("textbox", { name: "Issue number" });
    await userEvent.clear(number);
    await userEvent.type(number, "500");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /ready label/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));

    expect(act).toHaveBeenCalledWith(500, { action: "start", override: true });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New work" })).toBeNull());
  });

  it("keeps New work open and shows a refusal as a toast with the engine's reason", async () => {
    const act = vi.fn<DeskApi["act"]>(() =>
      Promise.reject(new DeskApiError("intake-refused", 409, "Issue #404 is closed."))
    );
    show("/", { act });
    const dialog = await openNewWork();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Issue number" }), "404");
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(await screen.findByText("Issue #404 is closed.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "New work" })).toBeTruthy();
  });

  it("fills the number from a picked issue and cannot pick one already on the desk", async () => {
    const act = vi.fn<DeskApi["act"]>(() =>
      Promise.resolve({ status: "accepted", action: "start", issueNumber: 12 })
    );
    show("/", {
      act,
      github: () =>
        Promise.resolve(
          lists([
            issue({ number: 12, ready: true }),
            issue({ number: 7, title: "Here", onBoard: true })
          ])
        )
    });
    const dialog = await openNewWork();
    await userEvent.click(
      await within(dialog).findByRole("button", { name: /#12 Add a CSV export/ })
    );
    expect(within(dialog).getByRole("textbox", { name: "Issue number" })).toHaveProperty(
      "value",
      "12"
    );
    expect(within(dialog).getByRole("button", { name: /#7 Here/ })).toHaveProperty(
      "disabled",
      true
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(act).toHaveBeenCalledWith(12, { action: "start", override: false });
  });

  it("switches to a desk job and starts the kind picked", async () => {
    const startJob = vi.fn<DeskApi["startJob"]>(() =>
      Promise.reject(new DeskApiError("busy", 409, null))
    );
    show("/", { startJob });
    const dialog = await openNewWork();
    await userEvent.click(within(dialog).getByRole("button", { name: "Desk job" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: /^Audit a screen/ }));
    await userEvent.type(within(dialog).getByLabelText("Lab screen id"), "10-sample");
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "audit", audit: { screenId: "10-sample" } })
    );
  });
});
