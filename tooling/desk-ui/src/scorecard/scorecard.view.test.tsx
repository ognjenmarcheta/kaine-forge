import type { ScorecardRun, ScorecardView } from "@repo/desk/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DeskApp } from "../desk.app";
import { fakeApi, renderDesk } from "../test/test.render";

const dimensions = (score: number): ScorecardRun["dimensions"] =>
  Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [
      String(index + 1),
      { score, evidence: `Gate ${index + 1} exits 0. Not 9: list ${index + 1} is hand-kept` }
    ])
  );

const RUNS: ScorecardRun[] = [
  {
    date: "2026-10-20",
    commit: "9cf8364aaaa",
    mode: "fan-out",
    agent: "claude",
    overall: 8,
    dimensions: dimensions(8),
    findings: [
      { slug: "old", title: "old finding", dimension: 2, ladderRank: 4, disposition: "observed" }
    ]
  },
  {
    date: "2026-11-02",
    commit: "34ca7e4bbbb",
    mode: "fan-out",
    agent: "claude",
    overall: 7,
    dimensions: dimensions(7),
    findings: [
      { slug: "old", title: "old finding", dimension: 2, ladderRank: 4, disposition: "fixed" },
      {
        slug: "e2e-mode-split",
        title: "ci: pr e2e and release e2e run different servers",
        dimension: 4,
        ladderRank: 2,
        disposition: "observed",
        reason: "Proposed for filing on 2026-11-02"
      }
    ]
  }
];

const READY: ScorecardView = {
  state: "ready",
  ledgerPath: "docs/agents/monorepo-scorecard.md",
  updatedAt: "2026-11-02T12:00:00.000Z",
  repository: "owner/repo",
  runs: RUNS,
  calibration: { "34ca7e4": ["Dim 4 → 7 with cause."] },
  flows: []
};

beforeEach(() => window.history.replaceState(null, "", "?view=scorecard"));
afterEach(() => window.history.replaceState(null, "", "/"));

describe("ScorecardView", () => {
  it("says how to create the ledger when the checkout has none", async () => {
    renderDesk(
      <DeskApp />,
      fakeApi({
        scorecard: () =>
          Promise.resolve({ state: "missing", ledgerPath: "docs/agents/monorepo-scorecard.md" })
      })
    );
    expect(
      await screen.findByText(/Run the kaine-scorecard skill, then pnpm scorecard/)
    ).toBeTruthy();
  });

  it("shows the latest run's dimensions, and a row opens to what holds the score back", async () => {
    renderDesk(<DeskApp />, fakeApi({ scorecard: () => Promise.resolve(READY) }));

    const table = (await screen.findByRole("heading", { name: "Dimensions" })).closest(
      "div.desk-panel"
    );
    if (!(table instanceof HTMLElement)) throw new Error("no dimensions panel");
    const toggles = within(table).getAllByRole("button", { expanded: false });
    expect(toggles).toHaveLength(10);
    expect(within(table).getAllByText("down 1.0")).toHaveLength(10);

    await userEvent.click(within(table).getByRole("button", { name: /Build & Cache/ }));
    expect(
      within(table)
        .getByRole("button", { name: /Build & Cache/ })
        .getAttribute("aria-expanded")
    ).toBe("true");
    expect(within(table).getByText("list 2 is hand-kept")).toBeTruthy();
    expect(screen.getByText("Dim 4 → 7 with cause.")).toBeTruthy();
  });

  it("lists the open findings first, and the fixed ones on request", async () => {
    renderDesk(<DeskApp />, fakeApi({ scorecard: () => Promise.resolve(READY) }));

    expect(await screen.findByText("Showing 1 of 2")).toBeTruthy();
    expect(screen.getByText("Proposed")).toBeTruthy();
    const filter = screen.getByRole("group", { name: "Show findings" });
    await userEvent.click(within(filter).getByRole("button", { name: "Fixed" }));
    expect(screen.getByText("Showing 1 of 2")).toBeTruthy();
    expect(screen.getByText("old finding")).toBeTruthy();
    expect(screen.queryByText("ci: pr e2e and release e2e run different servers")).toBeNull();
  });
});
