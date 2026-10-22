import type { GithubIssue, GithubLists, GithubPull, IssueSummary } from "@repo/desk/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeskApi } from "../api/api.client";
import { DeskApp } from "../desk.app";
import { fakeApi, makeState, makeSummary, renderDesk } from "../test/test.render";

const AT = "2026-03-01T10:00:00.000Z";

const issue = (over: Partial<GithubIssue>): GithubIssue => ({
  number: 12,
  title: "Add a CSV export",
  url: "https://github.com/o/r/issues/12",
  labels: [],
  ready: false,
  contract: { found: 6, total: 6 },
  onBoard: false,
  updatedAt: AT,
  ...over
});

const pull = (over: Partial<GithubPull>): GithubPull => ({
  number: 40,
  title: "feat: export",
  url: "https://github.com/o/r/pull/40",
  draft: false,
  branch: "feature/export",
  author: "someone",
  updatedAt: AT,
  issue: null,
  ...over
});

const lists = (issues: GithubIssue[], pulls: GithubPull[] = []): GithubLists => ({
  ok: true,
  issues,
  pulls,
  fetchedAt: AT
});

const ON_BOARD: IssueSummary = makeSummary(makeState({ issueNumber: 7 }));

const show = (github: DeskApi["github"], api: Partial<DeskApi> = {}) =>
  renderDesk(<DeskApp />, fakeApi({ issues: () => Promise.resolve([ON_BOARD]), github, ...api }));

const openStart = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Start issue" }));
  return screen.findByRole("dialog", { name: "Start an issue" });
};

describe("Start dialog issue picker", () => {
  const ISSUES = [
    issue({ number: 12, ready: true, labels: ["ready-for-agent"] }),
    issue({ number: 13, title: "Explain the verdict", contract: { found: 3, total: 6 } }),
    issue({ number: 7, title: "Already here", onBoard: true })
  ];

  it("fills the number from a picked issue and starts it without the override", async () => {
    const act = vi.fn<DeskApi["act"]>(() =>
      Promise.resolve({ status: "accepted", action: "start", issueNumber: 12 })
    );
    show(() => Promise.resolve(lists(ISSUES)), { act });
    const dialog = await openStart();

    await userEvent.click(
      await within(dialog).findByRole("button", { name: /#12 Add a CSV export/ })
    );

    expect(within(dialog).getByRole("textbox", { name: "Issue number" })).toHaveProperty(
      "value",
      "12"
    );
    expect(within(dialog).getByRole("button", { name: /#12/ }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(act).toHaveBeenCalledWith(12, { action: "start", override: false });
  });

  it("explains that an issue without the ready label needs the override, and never checks it", async () => {
    show(() => Promise.resolve(lists(ISSUES)));
    const dialog = await openStart();

    await userEvent.click(await within(dialog).findByRole("button", { name: /#13/ }));

    expect(within(dialog).getByRole("status").textContent).toContain(
      "#13 has no ready-for-agent label."
    );
    expect(within(dialog).getByRole("checkbox", { name: /own authority/ })).toHaveProperty(
      "ariaChecked",
      "false"
    );
    expect(within(dialog).getByText("Contract 3/6")).toBeTruthy();
  });

  it("filters by number or title and cannot pick an issue already on the board", async () => {
    show(() => Promise.resolve(lists(ISSUES)));
    const dialog = await openStart();

    expect(await within(dialog).findByRole("button", { name: /#7 Already here/ })).toHaveProperty(
      "disabled",
      true
    );
    await userEvent.type(within(dialog).getByRole("searchbox"), "verdict");
    expect(within(dialog).queryByRole("button", { name: /#12/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /#13/ })).toBeTruthy();
  });

  it("says why GitHub could not be listed and still allows a typed number", async () => {
    show(() => Promise.resolve({ ok: false, reason: "gh is not logged in", fetchedAt: AT }));
    const dialog = await openStart();
    expect(await within(dialog).findByText("gh is not logged in")).toBeTruthy();
    expect(within(dialog).getByRole("textbox", { name: "Issue number" })).toBeTruthy();
  });
});

/** The full pull request panel sits under the columns; Your turn lists pull requests in short. */
const showColumns = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole("button", { name: "Columns" }));
};

afterEach(() => {
  localStorage.clear();
});

describe("Open pull requests on the board", () => {
  it("lists them read-only, links a desk issue on the board, and refreshes from GitHub", async () => {
    const github = vi.fn<DeskApi["github"]>(() =>
      Promise.resolve(
        lists([], [pull({ draft: true }), pull({ number: 41, title: "fix: thing", issue: 7 })])
      )
    );
    show(github);
    await showColumns();

    const panel = await screen.findByRole("region", { name: "Open pull requests (2)" });
    expect(within(panel).getByRole("link", { name: "#40" }).getAttribute("href")).toBe(
      "https://github.com/o/r/pull/40"
    );
    expect(within(panel).getByText("Draft")).toBeTruthy();
    expect(
      within(panel).getByRole("link", { name: "Issue #7 on the board" }).getAttribute("href")
    ).toBe("?issue=7");
    expect(within(panel).queryByRole("button", { name: /Start|Fix|Merge/ })).toBeNull();

    await userEvent.click(within(panel).getByRole("button", { name: "Refresh" }));
    expect(github).toHaveBeenLastCalledWith(true);
  });

  it("does not link a pull request URL that is not http", async () => {
    show(() => Promise.resolve(lists([], [pull({ url: "javascript:alert(1)" })])));
    await showColumns();
    const panel = await screen.findByRole("region", { name: "Open pull requests (1)" });
    expect(within(panel).queryByRole("link", { name: "#40" })).toBeNull();
    expect(within(panel).getByText(/#40/)).toBeTruthy();
  });
});
