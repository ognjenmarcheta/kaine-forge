import type { IssueDetail, RiskOutcome, RunStats } from "@repo/desk/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { IssueActions } from "./gate.actions";
import { GatePanel } from "./gate.panel";
import { finishedResearchIssue, planArtifact } from "../../tests/fixture.data";
import type { ActionSettled } from "../state/desk.provider";
import { CUSTOM_FLOW_SNAPSHOT } from "../test/test.flow";
import { fakeApi, makeDetail, renderDesk } from "../test/test.render";

const DONE: ActionSettled = {
  kind: "done",
  outcome: { stop: "gate", stage: "pr-review", message: null }
};

const actionsOf = (
  overrides: Partial<IssueActions> = {}
): IssueActions & { run: ReturnType<typeof vi.fn<IssueActions["run"]>> } => {
  const run = vi.fn<IssueActions["run"]>(() => Promise.resolve(DONE));
  return { busy: false, run, ...overrides } as IssueActions & { run: typeof run };
};

/** Run stats with only the plan outcomes a test sets. */
const statsWith = (riskOutcomes: RiskOutcome[]): RunStats => ({
  groups: [],
  issues: [],
  riskOutcomes,
  days: Array.from({ length: 7 }, (_, day) => ({
    date: `2026-03-0${String(day + 1)}`,
    runs: 0,
    costUsd: null,
    shipped: 0
  })),
  invalidLines: 0
});

/** The plan artifact of the fixture: one open question. Every other read fails until stubbed. */
const apiWith = (stats?: RunStats) =>
  fakeApi({
    artifactJson: (_issue, id, schema) =>
      id === "plan"
        ? Promise.resolve(schema.parse(JSON.parse(planArtifact("low"))))
        : Promise.reject(new Error(`no artifact ${id}`)),
    ...(stats === undefined ? {} : { stats: () => Promise.resolve(stats) })
  });

const show = (
  stateOverrides: Parameters<typeof makeDetail>[0],
  actions: IssueActions,
  extra: {
    summary?: Parameters<typeof makeDetail>[1];
    detail?: Partial<IssueDetail>;
    onShowTrace?: () => void;
    stats?: RunStats;
  } = {}
) => {
  const { detail, summary } = makeDetail(stateOverrides, extra.summary);
  return renderDesk(
    <GatePanel
      detail={{ ...detail, ...extra.detail }}
      summary={summary}
      revision="r1"
      actions={actions}
      onOpenResult={vi.fn()}
      onShowTrace={extra.onShowTrace ?? vi.fn()}
    />,
    apiWith(extra.stats)
  );
};

const bar = (name: string) => screen.getByRole("group", { name });

describe("GatePanel at the plan gate", () => {
  it("approves the plan, with the answer to the open questions as its note", async () => {
    const actions = actionsOf();
    show({ stage: "plan-gate" }, actions);
    await userEvent.click(
      within(bar("Approve the plan")).getByRole("button", { name: "Approve plan" })
    );
    expect(actions.run).toHaveBeenLastCalledWith({ action: "approve" });

    await screen.findByText("Should the empty state link to the docs?");
    await userEvent.type(screen.getByRole("textbox", { name: /Your answer/ }), "  Yes, link it  ");
    await userEvent.click(screen.getByRole("button", { name: "Approve plan" }));
    expect(actions.run).toHaveBeenLastCalledWith({ action: "approve", note: "Yes, link it" });
  });

  it("shows how earlier plans of the same risk ended", async () => {
    show({ stage: "plan-gate" }, actionsOf(), {
      summary: { planRisk: "low" },
      stats: statsWith([{ risk: "low", issues: 10, shipped: 9, sentBack: 1 }])
    });
    expect(await screen.findByText("Low-risk plans: 9 shipped, 1 sent back")).toBeTruthy();
  });

  it("hides the track record while no earlier issue had a plan of that risk", async () => {
    show({ stage: "plan-gate" }, actionsOf(), {
      summary: { planRisk: "high" },
      stats: statsWith([
        { risk: "low", issues: 10, shipped: 9, sentBack: 1 },
        { risk: "high", issues: 0, shipped: 0, sentBack: 0 }
      ])
    });
    // Let the stats request settle before looking for its line.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getAllByText("High risk").length).toBeGreaterThan(0);
    expect(screen.queryByText(/plans: \d+ shipped/)).toBeNull();
  });

  it("shows what the planner changed since the last round", async () => {
    show(
      {
        stage: "plan-gate",
        history: [
          { at: "2026-03-01T10:00:00.000Z", stage: "plan", event: "plan-ready" },
          { at: "2026-03-01T10:05:00.000Z", stage: "plan", event: "plan-ready" }
        ]
      },
      actionsOf(),
      {
        detail: {
          plan: {
            risk: "low",
            riskReasons: [],
            revision: "- Added a fallback\n- Dropped the CLI flag"
          }
        }
      }
    );
    const changed = screen.getByRole("heading", { name: "What changed since round 1" });
    expect(changed.parentElement?.textContent).toContain("Added a fallback");
    expect(within(changed.parentElement ?? document.body).getAllByRole("listitem")).toHaveLength(2);
  });

  it("sends feedback to plan again, and clears the box only when the send worked", async () => {
    const actions = actionsOf();
    actions.run.mockResolvedValueOnce({ kind: "error", code: "busy", detail: null });
    show({ stage: "plan-gate" }, actions);
    const toggle = screen.getByRole("button", { name: "Request changes" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    const box = screen.getByRole("textbox", { name: "Feedback" });
    // The box takes focus when the form opens.
    expect(document.activeElement).toBe(box);
    const send = screen.getByRole("button", { name: "Send feedback" });
    expect(send).toHaveProperty("disabled", true);

    await userEvent.type(box, "Cover the empty case");
    await userEvent.click(send);
    expect(actions.run).toHaveBeenLastCalledWith({
      action: "feedback",
      to: "plan",
      text: "Cover the empty case"
    });
    // The first send failed: the text is still there.
    await waitFor(() => expect(box).toHaveProperty("value", "Cover the empty case"));

    // The second send worked: the form closes and focus goes to the decision heading.
    await userEvent.click(send);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Feedback" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Approve the plan" }));
  });

  it("disables every control that starts work while an action runs", () => {
    show({ stage: "plan-gate" }, actionsOf({ busy: true }));
    expect(screen.getByRole("button", { name: "Approve plan" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Request changes" })).toHaveProperty(
      "disabled",
      true
    );
  });
});

describe("GatePanel at a gate of the owner's own flow", () => {
  it("approves the step or sends the work back to a step the gate names, by its label", async () => {
    const actions = actionsOf();
    show({ flowSnapshot: CUSTOM_FLOW_SNAPSHOT, stage: "signoff", status: "waiting" }, actions);

    expect(screen.getByRole("heading", { name: "Your decision: Sign off" })).toBeTruthy();
    // The builder's step first, then the latest: the gate names plan and implement.
    expect(
      screen.getByText("Feedback can go back to: Back to Implement, Back to Sketch.")
    ).toBeTruthy();
    await userEvent.click(
      within(bar("Your decision: Sign off")).getByRole("button", { name: "Approve" })
    );
    // An approval of this gate is not a plan approval, and the toasts say so.
    expect(actions.run).toHaveBeenLastCalledWith(
      { action: "approve" },
      { pending: "desk.undo.pending.gateApprove", done: "desk.action.done.gateApprove" }
    );

    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const targets = screen.getByRole("radiogroup");
    expect(within(targets).getAllByRole("radio")).toHaveLength(2);
    await userEvent.click(within(targets).getByRole("radio", { name: "Back to Sketch" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Feedback" }), "Smaller sketch");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(actions.run).toHaveBeenLastCalledWith({
      action: "feedback",
      to: "plan",
      text: "Smaller sketch"
    });
  });
});

describe("GatePanel while the engine works", () => {
  it("offers Pause, and Resume once the issue is paused, even while a stage runs", async () => {
    const actions = actionsOf({ busy: true });
    show({ stage: "build", status: "running" }, actions, { summary: { busy: true } });
    expect(screen.queryByRole("button", { name: "Approve plan" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Build");
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(actions.run).toHaveBeenLastCalledWith({ action: "pause" });
  });

  it("resumes a paused issue and says since when it holds", async () => {
    const actions = actionsOf();
    show({ stage: "build", status: "waiting" }, actions, {
      summary: { paused: true, pausedAt: "2026-03-01T10:00:00.000Z" }
    });
    expect(screen.getByText(/^Paused since/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(actions.run).toHaveBeenLastCalledWith({ action: "resume" });
  });
});

describe("GatePanel at PR review", () => {
  it("sends feedback to the chosen stage", async () => {
    const actions = actionsOf();
    show({ stage: "pr-review" }, actions);
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Review again" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Feedback" }), "Look at tenancy");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(actions.run).toHaveBeenCalledWith({
      action: "feedback",
      to: "review",
      text: "Look at tenancy"
    });
  });

  it("says in one line that the work is ready to ship, and opens the two-step dialog", async () => {
    show({ stage: "pr-review" }, actionsOf());
    expect(screen.getByText("Ready to ship")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Ship as draft PR…" }));
    expect(
      await screen.findByRole("dialog", { name: "Ship to a draft pull request" })
    ).toBeTruthy();
  });

  it("names the ship conditions that do not hold", () => {
    const { detail } = makeDetail({ stage: "pr-review" });
    show({ stage: "pr-review" }, actionsOf(), {
      detail: { ship: { ...detail.ship, currentDiffMatches: false, ready: false } }
    });
    expect(screen.getByText("Not ready to ship")).toBeTruthy();
    expect(screen.getByRole("listitem").textContent).toBe("Worktree unchanged since the checks");
  });
});

describe("GatePanel when the desk needs you", () => {
  it("shows the engine's reason as plain text and continues", async () => {
    const actions = actionsOf();
    show({ stage: "needs-you", resumeStage: "build" }, actions, {
      summary: { needsYouReason: "Checks failed <script>window.injected = true</script>" }
    });
    expect(screen.getByRole("heading", { name: "Build stopped" })).toBeTruthy();
    expect(screen.getByLabelText("Reason from the engine").textContent).toContain(
      "Checks failed <script>"
    );
    expect(document.querySelector("script")).toBeNull();
    // The resume select names the stage the engine remembers.
    expect(screen.getByRole("combobox", { name: "Resume from" }).textContent).toContain(
      "Build (the engine remembers it)"
    );
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "continue" });
  });

  it("recommends telling the builder first, and sends the note to build", async () => {
    const actions = actionsOf();
    show({ stage: "needs-you", resumeStage: "build" }, actions);
    const options = screen.getAllByRole("heading", { level: 4 });
    expect(options[0]?.textContent).toBe("Tell the builder Recommended");
    const send = screen.getByRole("button", { name: "Send and continue" });
    expect(send).toHaveProperty("disabled", true);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Note to the builder" }),
      "Fix the test"
    );
    await userEvent.click(send);
    expect(actions.run).toHaveBeenCalledWith({
      action: "feedback",
      to: "build",
      text: "Fix the test"
    });
  });

  it("offers the session command only when the desk knows one, and links to the trace", async () => {
    const onShowTrace = vi.fn();
    show({ stage: "needs-you", resumeStage: "build" }, actionsOf(), { onShowTrace });
    expect(screen.queryByRole("heading", { name: "Open the session yourself" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "See it in the trace" }));
    expect(onShowTrace).toHaveBeenCalledTimes(1);

    const command = "cd /w && claude --resume abc";
    show({ stage: "needs-you", resumeStage: "build" }, actionsOf(), {
      detail: {
        resume: {
          worktreePath: "/w",
          sessions: [{ role: "builder", sessionId: "abc", provider: "claude", command }]
        }
      }
    });
    expect(screen.getByText(command)).toBeTruthy();
  });

  it("starts an issue that stopped at intake again, with the override the engineer chooses", async () => {
    const actions = actionsOf();
    show({ stage: "needs-you", resumeStage: "intake" }, actions);
    // Intake cannot continue: no resume select and no Continue.
    expect(screen.queryByRole("combobox", { name: "Resume from" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();

    await userEvent.click(screen.getByRole("checkbox", { name: /own authority/ }));
    await userEvent.click(screen.getByRole("button", { name: "Start again" }));

    expect(actions.run).toHaveBeenCalledWith({ action: "start", override: true });
  });
});

describe("GatePanel after the ship", () => {
  it("at pr-open: links the draft PR, shows the PR rounds, says that the engineer merges it, and checks the PR", async () => {
    const actions = actionsOf();
    show(
      {
        stage: "pr-open",
        status: "waiting",
        prUrl: "https://github.com/o/r/pull/9",
        prNumber: 9,
        prRounds: 1
      },
      actions
    );
    const link = screen.getByRole("link", { name: "Open the draft pull request" });
    expect(link.getAttribute("href")).toBe("https://github.com/o/r/pull/9");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.getByText("PR feedback rounds: 1 of 3")).toBeTruthy();
    expect(screen.getAllByText(/You merge it yourself/)).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Check the PR" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "refresh-pr" });
  });

  it("at pr-open: sends the PR feedback to build, without words or with the engineer's words", async () => {
    const actions = actionsOf();
    show({ stage: "pr-open", status: "waiting", prNumber: 9 }, actions);
    const open = () => userEvent.click(screen.getByRole("button", { name: "Send PR feedback" }));
    const box = () => screen.getByRole("textbox", { name: "Your note for the builder (optional)" });
    const send = () => userEvent.click(screen.getByRole("button", { name: "Send to build" }));

    await open();
    expect(document.activeElement).toBe(box());
    await send();
    expect(actions.run).toHaveBeenLastCalledWith({ action: "pr-feedback" });

    await open();
    await userEvent.type(box(), "  Keep the old name  ");
    await send();
    expect(actions.run).toHaveBeenLastCalledWith({
      action: "pr-feedback",
      text: "  Keep the old name  "
    });
  });

  it("after the merge: links the pull request and offers nothing to check", () => {
    show({ stage: "shipped", status: "done", prUrl: "https://github.com/o/r/pull/9" }, actionsOf());
    const link = screen.getByRole("link", { name: "Open the pull request" });
    expect(link.getAttribute("href")).toBe("https://github.com/o/r/pull/9");
    expect(screen.queryByRole("button", { name: "Check the PR" })).toBeNull();
  });

  it("at the end of a flow without a ship: says every step ran and nothing shipped", () => {
    show({ flowSnapshot: CUSTOM_FLOW_SNAPSHOT, stage: "finished", status: "done" }, actionsOf());
    expect(screen.getByRole("heading", { name: "Finished" })).toBeTruthy();
    expect(screen.getByText(/Every step ran; nothing was shipped/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("at the end of a research flow: shows the last report under its step, and opens the one before it", async () => {
    const seed = finishedResearchIssue(7, "Find the old pages");
    const { detail, summary } = makeDetail(seed.state);
    const onOpenResult = vi.fn();
    renderDesk(
      <GatePanel
        detail={detail}
        summary={summary}
        revision="r1"
        actions={actionsOf()}
        onOpenResult={onOpenResult}
        onShowTrace={vi.fn()}
      />,
      fakeApi({
        artifactJson: (_issue, id, schema) => {
          const text = seed.artifacts[`${id}.json`];
          return text === undefined
            ? Promise.reject(new Error(`no artifact ${id}`))
            : Promise.resolve(schema.parse(JSON.parse(text)));
        }
      })
    );
    expect(screen.getByRole("heading", { name: "Result of Summarize" })).toBeTruthy();
    const finding = await screen.findByText(/Rewrite the stage table/);
    expect(within(finding).getByText("docs/agents/agent-desk.md:240-255").tagName).toBe("CODE");
    expect(screen.getByText("Two help pages need new text about flows.")).toBeTruthy();
    // The researcher's report is one click away, not on the card.
    expect(screen.queryByText("Two help pages are out of date.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Research" }));
    expect(onOpenResult).toHaveBeenCalledWith("research");
  });

  it.each(["pr-open", "shipped"] as const)(
    "never links an address that is not a web link (%s)",
    (stage) => {
      const status = stage === "shipped" ? "done" : "waiting";
      show({ stage, status, prUrl: "javascript:alert(1)" }, actionsOf());
      expect(screen.queryByRole("link")).toBeNull();
    }
  );
});
