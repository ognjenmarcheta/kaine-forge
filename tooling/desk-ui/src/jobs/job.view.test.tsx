import type { JobState } from "@repo/desk/contracts";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EventSourceLike } from "../api/api.stream";
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
  screen: null,
  component: null,
  audit: null,
  approvedIssues: [],
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

  it("shows a job change the server sends while the page is open", async () => {
    window.history.replaceState(null, "", "?job=2");
    const listeners = new Map<string, (event: MessageEvent<string>) => void>();
    const source: EventSourceLike = {
      onopen: null,
      onerror: null,
      addEventListener: (type, listener) => listeners.set(type, listener),
      close: () => undefined
    };
    const running = job({ status: "running", stage: "score", result: null });
    renderDesk(<DeskApp />, fakeApi({ jobs: () => Promise.resolve([running]) }), () => source);
    expect(await screen.findByRole("heading", { name: /Scorecard job 2/ })).toBeTruthy();
    expect(screen.queryByText(/The job spent its budget/)).toBeNull();

    const stopped = job({
      status: "needs-you",
      stage: "score",
      stop: { reason: "budget", detail: "The scorer spent its $15 budget." },
      result: null,
      updatedAt: "2026-11-02T12:10:00.000Z"
    });
    act(() => {
      listeners.get("job-updated")?.(
        new MessageEvent("job-updated", {
          data: JSON.stringify({ type: "job-updated", job: stopped })
        })
      );
    });
    expect(await screen.findByText(/The job spent its budget/)).toBeTruthy();
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
    // The start opens New work on the desk job tab, with the job kind picked.
    const dialog = screen.getByRole("dialog", { name: "New work" });
    expect(
      within(dialog)
        .getByRole("radio", { name: /^Run the scorecard/ })
        .getAttribute("aria-checked")
    ).toBe("true");
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

describe("Screen jobs", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

  it("starts a screen job from the lab with the reference image as base64", async () => {
    window.history.replaceState(null, "", "?view=lab#/charts");
    const startJob = vi.fn(() =>
      Promise.resolve(job({ id: 3, kind: "screen", status: "running", stage: "setup" }))
    );
    renderDesk(<DeskApp />, fakeApi({ startJob }));
    const user = userEvent.setup({ applyAccept: false });

    await user.click(await screen.findByRole("button", { name: "Recreate screen" }));
    // The start opens New work on the desk job tab, with the job kind picked.
    const dialog = screen.getByRole("dialog", { name: "New work" });
    expect(
      within(dialog)
        .getByRole("radio", { name: /^Recreate a screen/ })
        .getAttribute("aria-checked")
    ).toBe("true");
    await user.type(within(dialog).getByLabelText("Screen id"), "10-sample");
    await user.type(within(dialog).getByLabelText("Screen title"), "Sample");
    const file = within(dialog).getByLabelText(/Reference image/);
    await user.upload(file, new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    expect(within(dialog).getByText("Pick a PNG, JPEG, or WebP image.")).toBeTruthy();
    const startButton = within(dialog).getByRole("button", { name: "Start" });
    expect(startButton).toHaveProperty("disabled", true);

    await user.upload(file, new File([PNG], "ref.png", { type: "image/png" }));
    await user.click(startButton);

    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "screen",
        budgetUsd: 10,
        screen: {
          id: "10-sample",
          title: "Sample",
          mode: "light",
          width: 1440,
          height: 900,
          reference: { mediaType: "image/png", dataBase64: btoa(String.fromCharCode(...PNG)) }
        }
      })
    );
    expect(window.location.search).toBe("?job=3");
  });

  it("links the gate to the job's compare view and pushes only after the confirmation", async () => {
    window.history.replaceState(null, "", "?job=3");
    const waiting = job({
      id: 3,
      kind: "screen",
      input: {
        note: "",
        model: "opus",
        budgetUsd: 10,
        minutes: 60,
        screen: {
          id: "10-sample",
          title: "Sample",
          mode: "light",
          width: 1440,
          height: 900,
          reference: "10-sample.png"
        }
      },
      result: null,
      screen: {
        result: {
          summary: "Recreated.",
          deviations: ["COLOR-1: darker label."],
          openQuestions: [],
          plainLanguage: "Close."
        },
        diffPercent: 3.4,
        port: 5555
      }
    });
    const jobAction = vi.fn(() => Promise.resolve(waiting));
    renderDesk(<DeskApp />, fakeApi({ jobs: () => Promise.resolve([waiting]), jobAction }));

    const compare = await screen.findByRole("link", { name: "Open the compare view" });
    expect(compare.getAttribute("href")).toBe("http://localhost:5555/?view=lab#/compare/10-sample");
    expect(screen.getByText("3.4% of pixels still differ from the reference.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Approve…" }));
    expect(jobAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Push the screen and open the PR?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Push and open PR" }));

    expect(jobAction).toHaveBeenCalledWith(3, { action: "approve", issues: [], confirm: true });
  });
});

describe("Component and audit jobs", () => {
  const COMPONENT = { name: "RatingStars", layer: "composed" } as const;

  it("starts a component job only with what the component is for", async () => {
    window.history.replaceState(null, "", "?view=lab#/charts");
    const startJob = vi.fn(() =>
      Promise.resolve(job({ id: 4, kind: "component", status: "running", stage: "setup" }))
    );
    renderDesk(<DeskApp />, fakeApi({ startJob }));

    await userEvent.click(await screen.findByRole("button", { name: "Build component" }));
    // The start opens New work on the desk job tab, with the job kind picked.
    const dialog = screen.getByRole("dialog", { name: "New work" });
    expect(
      within(dialog)
        .getByRole("radio", { name: /^Build a component/ })
        .getAttribute("aria-checked")
    ).toBe("true");
    await userEvent.type(within(dialog).getByLabelText("Component name"), "RatingStars");
    const startButton = within(dialog).getByRole("button", { name: "Start" });
    expect(startButton).toHaveProperty("disabled", true);
    await userEvent.type(
      within(dialog).getByLabelText("What the component is for"),
      "Show a 0–5 rating."
    );
    await userEvent.click(startButton);

    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "component",
        note: "Show a 0–5 rating.",
        component: COMPONENT
      })
    );
  });

  it("approves a plan in one step, because the build only starts", async () => {
    window.history.replaceState(null, "", "?job=4");
    const planned = job({
      id: 4,
      kind: "component",
      stage: "plan",
      input: { note: "", model: "opus", budgetUsd: 10, minutes: 60, component: COMPONENT },
      result: null,
      component: {
        plan: {
          summary: "A row of stars.",
          api: ["value: number"],
          reuse: [],
          tests: [],
          openQuestions: [],
          plainLanguage: "Stars."
        },
        planApproved: false,
        result: null,
        port: null
      }
    });
    const jobAction = vi.fn(() => Promise.resolve(planned));
    renderDesk(<DeskApp />, fakeApi({ jobs: () => Promise.resolve([planned]), jobAction }));

    expect(await screen.findByText("value: number")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Approve the plan and build" }));

    expect(jobAction).toHaveBeenCalledWith(4, { action: "approve", issues: [], confirm: true });
  });

  it("files only the ticked audit findings after the confirmation", async () => {
    window.history.replaceState(null, "", "?job=5");
    const audited = job({
      id: 5,
      kind: "audit",
      input: {
        note: "",
        model: "opus",
        budgetUsd: 5,
        minutes: 30,
        audit: { screenId: "10-sample" }
      },
      result: null,
      audit: {
        result: {
          summary: "Two problems.",
          matchPercent: 91,
          findings: ["low-contrast-label", "missing-focus-ring"].map((slug) => ({
            slug,
            title: `fix(lab): ${slug}`,
            labels: [],
            body: "## Outcome",
            ruleId: "COLOR-1",
            severity: "must" as const
          })),
          openQuestions: [],
          plainLanguage: "Fix two things."
        },
        port: 5555
      }
    });
    const jobAction = vi.fn(() => Promise.resolve(audited));
    renderDesk(<DeskApp />, fakeApi({ jobs: () => Promise.resolve([audited]), jobAction }));

    const preview = await screen.findByRole("link", { name: "Open the screen" });
    expect(preview.getAttribute("href")).toBe("http://localhost:5555/?view=lab#/compare/10-sample");
    await userEvent.click(screen.getByRole("checkbox", { name: "fix(lab): missing-focus-ring" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve…" }));
    expect(jobAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "File the ticked findings?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "File issues" }));

    expect(jobAction).toHaveBeenCalledWith(5, {
      action: "approve",
      issues: ["missing-focus-ring"],
      confirm: true
    });
  });
});
