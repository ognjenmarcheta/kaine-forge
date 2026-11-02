import type { JobState } from "@repo/desk/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeskApp } from "../desk.app";
import { fakeApi, renderDesk } from "../test/test.render";

const job = (over: Partial<JobState> = {}): JobState => ({
  schema: 1,
  id: 2,
  kind: "scorecard",
  createdAt: "2026-11-02T12:00:00.000Z",
  updatedAt: "2026-11-02T12:05:00.000Z",
  input: { note: "", model: "opus", budgetUsd: 15, minutes: 60 },
  status: "waiting",
  stage: "review",
  stop: null,
  branch: "KAINE-chore-scorecard-2026-11-02-job-2",
  worktree: "/wt",
  spentUsd: 4.2,
  feedback: [],
  history: [{ at: "2026-11-02T12:05:00.000Z", stage: "review", message: "Scored 7.7." }],
  result: {
    summary: "Two dimensions dropped.",
    run: {
      date: "2026-11-02",
      commit: "a".repeat(40),
      mode: "fan-out",
      agent: "desk-job",
      overall: 7.7,
      dimensions: {},
      findings: []
    },
    calibration: [],
    proposedIssues: ["ui-lab-gap", "adr-index-drift"].map((slug) => ({
      slug,
      title: `docs: ${slug}`,
      labels: ["type:docs"],
      body: "## Outcome"
    })),
    openQuestions: ["Should dim 6 drop?"],
    plainLanguage: "Plain."
  },
  filedIssues: [],
  pr: null,
  ...over
});

afterEach(() => window.history.replaceState(null, "", "/"));

describe("JobView", () => {
  it("files only the ticked issues after the confirmation", async () => {
    window.history.replaceState(null, "", "?job=2");
    const jobAction = vi.fn(() => Promise.resolve(job()));
    renderDesk(<DeskApp />, fakeApi({ jobs: () => Promise.resolve([job()]), jobAction }));

    expect(await screen.findByText("Should dim 6 drop?")).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: "docs: adr-index-drift" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve…" }));
    const dialog = screen.getByRole("dialog", { name: "File the issues and open the PR?" });
    expect(within(dialog).getByText(/files 1 ticked issues/)).toBeTruthy();
    expect(jobAction).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "File and open PR" }));

    expect(jobAction).toHaveBeenCalledWith(2, {
      action: "approve",
      issues: ["adr-index-drift"],
      confirm: true
    });
  });

  it("says why a stopped job stopped and continues it", async () => {
    window.history.replaceState(null, "", "?job=2");
    const stopped = job({
      status: "needs-you",
      stage: "score",
      stop: { reason: "budget", detail: "The scorer spent its $15 budget." },
      result: null
    });
    const jobAction = vi.fn(() => Promise.resolve(stopped));
    renderDesk(<DeskApp />, fakeApi({ jobs: () => Promise.resolve([stopped]), jobAction }));

    expect(await screen.findByText(/The job spent its budget/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(jobAction).toHaveBeenCalledWith(2, { action: "continue" });
  });
});

describe("Scorecard jobs on the Scorecard view", () => {
  it("starts a scorecard job with the chosen limits and opens its page", async () => {
    window.history.replaceState(null, "", "?view=scorecard");
    const startJob = vi.fn(() =>
      Promise.resolve(job({ status: "running", stage: "setup", result: null }))
    );
    renderDesk(
      <DeskApp />,
      fakeApi({
        scorecard: () =>
          Promise.resolve({ state: "missing", ledgerPath: "docs/agents/monorepo-scorecard.md" }),
        startJob
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Run scorecard" }));
    const dialog = screen.getByRole("dialog", { name: "Run the scorecard" });
    const budget = within(dialog).getByLabelText("Budget in US dollars");
    await userEvent.clear(budget);
    await userEvent.type(budget, "9");
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));

    expect(startJob).toHaveBeenCalledWith({
      kind: "scorecard",
      note: "",
      model: "opus",
      budgetUsd: 9,
      minutes: 60
    });
    expect(window.location.search).toBe("?job=2");
  });

  it("previews a job's ledger and offers no second run while one is open", async () => {
    window.history.replaceState(null, "", "?view=scorecard&job=2");
    const scorecard = vi.fn(() =>
      Promise.resolve({
        state: "missing" as const,
        ledgerPath: "docs/agents/monorepo-scorecard.md"
      })
    );
    renderDesk(<DeskApp />, fakeApi({ jobs: () => Promise.resolve([job()]), scorecard }));

    expect(await screen.findByText(/Preview of job 2/)).toBeTruthy();
    expect(scorecard).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("button", { name: "Run scorecard" })).toBeNull();
  });
});
