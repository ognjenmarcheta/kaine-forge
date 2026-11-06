import type { FlowSnapshot, IssueDetail, RiskOutcome, RunStats } from "@repo/desk/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { IssueActions } from "./gate.actions";
import { GatePanel } from "./gate.panel";
import { finishedResearchIssue, planArtifact } from "../../tests/fixture.data";
import type { DeskApi } from "../api/api.client";
import type { ActionSettled } from "../state/desk.provider";
import { CUSTOM_FLOW_SNAPSHOT, DEFAULT_FLOW_SNAPSHOT } from "../test/test.flow";
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
const apiWith = (stats?: RunStats, diff?: string) =>
  fakeApi({
    artifactJson: (_issue, id, schema) =>
      id === "plan"
        ? Promise.resolve(schema.parse(JSON.parse(planArtifact("low"))))
        : Promise.reject(new Error(`no artifact ${id}`)),
    ...(stats === undefined ? {} : { stats: () => Promise.resolve(stats) }),
    ...(diff === undefined
      ? {}
      : {
          artifactText: (_issue: number, id: string) =>
            id === "diff" ? Promise.resolve(diff) : Promise.reject(new Error(`no artifact ${id}`))
        })
  });

const show = (
  stateOverrides: Parameters<typeof makeDetail>[0],
  actions: IssueActions,
  extra: {
    summary?: Parameters<typeof makeDetail>[1];
    detail?: Partial<IssueDetail>;
    onShowTrace?: () => void;
    stats?: RunStats;
    diff?: string;
    api?: DeskApi;
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
    extra.api ?? apiWith(extra.stats, extra.diff)
  );
};

const A_DIFF =
  "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+next\n";

/** A review with one finding on the diff line above, which has a suggested fix. */
const REVIEW: NonNullable<IssueDetail["review"]> = {
  verdict: "approve",
  blocking: 0,
  bySeverity: { Critical: 0, Consider: 1, Nit: 0, FYI: 0 },
  findings: [
    {
      severity: "Consider",
      blocking: false,
      file: "src/a.ts",
      line: 1,
      section: "Quality Gates",
      summary: "The name is not kept.",
      fix: "Keep the old name."
    }
  ],
  rejected: 0,
  diffHash: "d".repeat(64),
  plainLanguage: "Plain."
};

const SHIP_PLAN = {
  dryRun: true,
  branch: "KAINE-7-feat-thing",
  gate: { ok: true, failures: [] },
  changeset: { kind: "file", reason: "A package changed" },
  changesetText: '---\n"@repo/web": patch\n---\n\nAdd a thing.\n',
  commitHeader: "feat(web): add a thing",
  pullRequest: { title: "feat(web): add a thing", base: "main" },
  files: ["src/a.ts"],
  unfilledHeadings: []
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

  it("shows the report of a step between the plan and the gate under its step", async () => {
    const [planner] = DEFAULT_FLOW_SNAPSHOT.agents;
    if (planner === undefined) throw new Error("the default flow has a planner");
    const snapshot: FlowSnapshot = {
      ...DEFAULT_FLOW_SNAPSHOT,
      agents: [
        ...DEFAULT_FLOW_SNAPSHOT.agents,
        { ...planner, id: "design-partner", output: "report" }
      ],
      flow: {
        ...DEFAULT_FLOW_SNAPSHOT.flow,
        steps: DEFAULT_FLOW_SNAPSHOT.flow.steps.flatMap((step) =>
          step.id === "plan"
            ? [step, { id: "design", kind: "agent", label: "Design", agent: "design-partner" }]
            : [step]
        )
      }
    };
    const at = "2026-03-01T10:00:00.000Z";
    show(
      {
        flowSnapshot: snapshot,
        stage: "plan-gate",
        history: [
          { at, stage: "plan", event: "stage-started" },
          { at, stage: "plan", event: "plan-ready" },
          { at, stage: "design", event: "stage-started" },
          { at, stage: "design", event: "report-ready" }
        ]
      },
      actionsOf(),
      {
        api: fakeApi({
          artifactJson: (_issue, id, schema) =>
            id === "plan"
              ? Promise.resolve(schema.parse(JSON.parse(planArtifact("low"))))
              : id === "report-design-partner"
                ? Promise.resolve(
                    schema.parse({
                      summary: "The plan misses the empty state.",
                      findings: ["Add an empty state to the board."],
                      plainLanguage: "The board needs an empty state."
                    })
                  )
                : Promise.reject(new Error(`no artifact ${id}`))
        })
      }
    );
    expect(screen.getByRole("heading", { name: "Result of Design" })).toBeTruthy();
    expect(await screen.findByText("The board needs an empty state.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve plan" })).toBeTruthy();
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
    const changed = screen.getByText("What changed since round 1");
    expect(changed.parentElement?.textContent).toContain("Added a fallback");
    expect(within(changed.parentElement ?? document.body).getAllByRole("listitem")).toHaveLength(2);
  });

  it("sends feedback to plan again, and clears the box only when the send worked", async () => {
    const actions = actionsOf();
    actions.run.mockResolvedValueOnce({ kind: "error", code: "busy", detail: null });
    show({ stage: "plan-gate" }, actions);
    const toggle = screen.getByRole("button", { name: "Send back…" });
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
    expect(screen.getByRole("button", { name: "Send back…" })).toHaveProperty("disabled", true);
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

    await userEvent.click(screen.getByRole("button", { name: "Send back…" }));
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
  it("tells the running builder a note from a box that opens on request, while the engine is busy", async () => {
    const actions = actionsOf({ busy: true });
    show({ stage: "build", status: "running" }, actions, { summary: { busy: true } });
    expect(screen.queryByLabelText("Note for Builder")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Tell Builder…" }));
    const note = screen.getByLabelText("Note for Builder");
    await userEvent.type(note, "Reuse the CSV helper.");
    await userEvent.click(screen.getByRole("button", { name: "Send the note" }));
    expect(actions.run).toHaveBeenLastCalledWith({
      action: "steer",
      note: "Reuse the CSV helper."
    });
    await waitFor(() => expect((note as HTMLTextAreaElement).value).toBe(""));
  });

  it("keeps what the owner typed while a steer was being sent", async () => {
    let settle: (settled: ActionSettled) => void = () => undefined;
    const run = vi.fn<IssueActions["run"]>(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        })
    );
    show({ stage: "build", status: "running" }, { busy: true, run }, { summary: { busy: true } });
    await userEvent.click(screen.getByRole("button", { name: "Tell Builder…" }));
    const note = screen.getByLabelText("Note for Builder");
    await userEvent.type(note, "Reuse the helper.");
    await userEvent.click(screen.getByRole("button", { name: "Send the note" }));
    await userEvent.type(note, " Keep the API.");
    await act(async () => {
      settle(DONE);
      await Promise.resolve();
    });
    expect((note as HTMLTextAreaElement).value).toBe("Reuse the helper. Keep the API.");
  });

  it("offers no note on a step the engine runs, and says why", () => {
    show({ stage: "check", status: "running" }, actionsOf(), { summary: { busy: true } });
    expect(screen.queryByRole("button", { name: /^Tell / })).toBeNull();
    expect(screen.getByText(/The engine runs this step/)).toBeTruthy();
  });
});

describe("GatePanel at PR review", () => {
  it("collects line comments on the diff and sends them to the builder with Send back", async () => {
    const actions = actionsOf();
    show({ stage: "pr-review" }, actions, { diff: A_DIFF });
    await userEvent.click(await screen.findByRole("button", { name: "Comment on line 1" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Comment on line 1 for the builder" }),
      "Keep the old name"
    );
    await userEvent.click(screen.getByRole("button", { name: "Add comment" }));
    // Nothing goes out until the owner sends back; the strip says so.
    expect(screen.getByText("You · for the builder")).toBeTruthy();
    expect(screen.getByText("Comments not sent yet: 1.")).toBeTruthy();
    expect(actions.run).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Review and send back" }));
    await userEvent.click(screen.getByRole("button", { name: "Send back with comments (1)" }));
    expect(actions.run).toHaveBeenCalledWith({
      action: "feedback",
      to: "build",
      text: "Line comments:\n- src/a.ts:1: Keep the old name"
    });
  });

  it("applies a suggested fix by queueing it for the builder, and Undo takes it back", async () => {
    const actions = actionsOf();
    show({ stage: "pr-review" }, actions, { diff: A_DIFF, detail: { review: REVIEW } });
    await userEvent.click(await screen.findByRole("button", { name: "Apply fix" }));
    expect(screen.getByText("Queued for the builder")).toBeTruthy();
    expect(actions.run).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("Queued for the builder")).toBeNull();
    expect(screen.queryByText(/Comments not sent yet/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Apply fix" }));
    await userEvent.click(screen.getByRole("button", { name: "Review and send back" }));
    // The comments alone are enough to send: the note is optional.
    await userEvent.click(screen.getByRole("button", { name: "Send back with comments (1)" }));
    expect(actions.run).toHaveBeenCalledTimes(1);
    expect(actions.run).toHaveBeenCalledWith({
      action: "feedback",
      to: "build",
      text: "Line comments:\n- src/a.ts:1: The name is not kept. Apply this fix: Keep the old name."
    });
  });

  it("sends queued comments to the step chosen in the form, not always to the builder", async () => {
    const actions = actionsOf();
    show({ stage: "pr-review" }, actions, { diff: A_DIFF, detail: { review: REVIEW } });
    await userEvent.click(await screen.findByRole("button", { name: "Apply fix" }));
    await userEvent.click(screen.getByRole("button", { name: "Review and send back" }));
    await userEvent.click(screen.getByRole("radio", { name: "Review again" }));
    await userEvent.click(screen.getByRole("button", { name: "Send back with comments (1)" }));
    expect(actions.run).toHaveBeenCalledWith({
      action: "feedback",
      to: "review",
      text: "Line comments:\n- src/a.ts:1: The name is not kept. Apply this fix: Keep the old name."
    });
  });

  it("keeps a fix applied while a send back runs, and drops only what was sent", async () => {
    let finish: (settled: ActionSettled) => void = () => undefined;
    const actions = actionsOf({
      run: vi.fn<IssueActions["run"]>(() => new Promise((resolve) => (finish = resolve)))
    });
    const second: NonNullable<IssueDetail["review"]>["findings"][number] = {
      severity: "Consider",
      blocking: false,
      file: "src/a.ts",
      line: 1,
      section: "Quality Gates",
      summary: "The label is missing.",
      fix: "Add a label."
    };
    show({ stage: "pr-review" }, actions, {
      diff: A_DIFF,
      detail: { review: { ...REVIEW, findings: [...REVIEW.findings, second] } }
    });
    const [first] = await screen.findAllByRole("button", { name: "Apply fix" });
    if (first === undefined) throw new Error("no Apply fix button");
    await userEvent.click(first);
    await userEvent.click(screen.getByRole("button", { name: "Review and send back" }));
    await userEvent.click(screen.getByRole("button", { name: "Send back with comments (1)" }));
    // The send is out; the owner applies the second fix before it settles.
    await userEvent.click(screen.getByRole("button", { name: "Apply fix" }));
    await act(async () => finish(DONE));
    expect(await screen.findByText("Comments not sent yet: 1.")).toBeTruthy();
  });

  it("warns on Ship that comments are not sent, and sends back instead on request", async () => {
    const actions = actionsOf();
    show({ stage: "pr-review" }, actions, {
      diff: A_DIFF,
      detail: { review: REVIEW },
      api: fakeApi({
        artifactText: (_issue, id) =>
          id === "diff" ? Promise.resolve(A_DIFF) : Promise.reject(new Error(`no artifact ${id}`)),
        artifactJson: (_issue, id, schema) =>
          id === "ship-plan"
            ? Promise.resolve(schema.parse(SHIP_PLAN))
            : Promise.reject(new Error(`no artifact ${id}`))
      })
    });
    await userEvent.click(await screen.findByRole("button", { name: "Apply fix" }));
    await userEvent.click(screen.getByRole("button", { name: "Ship as draft PR…" }));
    const dialog = await screen.findByRole("dialog", { name: "Ship to a draft pull request" });
    expect(await within(dialog).findByText("Comments are not sent.")).toBeTruthy();
    expect(dialog.textContent).toContain("Comments not sent: 1. Shipping does not send them.");

    await userEvent.click(within(dialog).getByRole("button", { name: "Send back instead" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Send back with comments (1)" })).toBeTruthy();
    expect(actions.run).not.toHaveBeenCalledWith(expect.objectContaining({ action: "feedback" }));
  });

  it("keeps Send back disabled with no note and no comments", async () => {
    show({ stage: "pr-review" }, actionsOf());
    await userEvent.click(screen.getByRole("button", { name: "Send back…" }));
    expect(screen.getByRole("button", { name: "Send feedback" })).toHaveProperty("disabled", true);
  });

  it("sends feedback to the chosen stage", async () => {
    const actions = actionsOf();
    show({ stage: "pr-review" }, actions);
    await userEvent.click(screen.getByRole("button", { name: "Send back…" }));
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
    expect(screen.getByRole("heading", { name: "The desk stopped at Build" })).toBeTruthy();
    expect(screen.getByLabelText("Reason from the engine").textContent).toContain(
      "Checks failed <script>"
    );
    expect(document.querySelector("script")).toBeNull();
    // Retry is one of the choices; its select names the stage the engine remembers.
    await userEvent.click(screen.getByRole("radio", { name: "Retry from a step" }));
    expect(screen.getByRole("combobox", { name: "Resume from" }).textContent).toContain(
      "Build (the engine remembers it)"
    );
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "continue" });
  });

  it("offers to allow a refused command first, and sends that exact command", async () => {
    const actions = actionsOf();
    const command = "pnpm turbo run lint --filter=@repo/web --dry=json";
    show({ stage: "needs-you", resumeStage: "build" }, actions, {
      detail: { deniedCommands: [command] }
    });

    const allow = screen.getByRole("radio", { name: /Allow this command and retry/ });
    expect(allow.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Allow this command and retry").closest("label")?.textContent).toBe(
      "Allow this command and retryRecommended"
    );
    // The tell option stays, but it is no longer the recommended one.
    expect(screen.getByText("Tell the builder").closest("label")?.textContent).toBe(
      "Tell the builder"
    );
    expect(screen.getAllByText(command).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "Allow and retry" }));
    expect(actions.run).toHaveBeenCalledWith({
      action: "resolve-denial",
      command,
      resolution: "allow"
    });
  });

  it("skips the refused command with one click and no note", async () => {
    const actions = actionsOf();
    const command = "pnpm turbo run lint --filter=@repo/web --dry=json";
    show({ stage: "needs-you", resumeStage: "build" }, actions, {
      detail: { deniedCommands: [command] }
    });

    await userEvent.click(screen.getByRole("radio", { name: /Skip it and continue/ }));
    await userEvent.click(screen.getByRole("button", { name: "Skip and continue" }));
    expect(actions.run).toHaveBeenCalledWith({
      action: "resolve-denial",
      command,
      resolution: "skip"
    });
  });

  it("goes back to the default choice when the refused command goes away, and back to allow when it returns", async () => {
    const actions = actionsOf();
    const command = "pnpm turbo run lint --filter=@repo/web --dry=json";
    const { detail, summary } = makeDetail({ stage: "needs-you", resumeStage: "build" });
    let setDenied: (next: string[]) => void = () => undefined;
    function Harness() {
      const [denied, set] = useState([command]);
      setDenied = set;
      return (
        <GatePanel
          detail={{ ...detail, deniedCommands: denied }}
          summary={summary}
          revision="r1"
          actions={actions}
          onOpenResult={vi.fn()}
          onShowTrace={vi.fn()}
        />
      );
    }
    renderDesk(<Harness />, apiWith());
    expect(screen.getByRole("button", { name: "Allow and retry" })).toBeTruthy();

    act(() => setDenied([]));
    // The allow option is gone. The primary button acts on the default again: tell the builder.
    expect(screen.queryByRole("radio", { name: /Allow this command/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Allow and retry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send to the builder" })).toBeTruthy();

    act(() => setDenied([command]));
    expect(screen.getByRole("button", { name: "Allow and retry" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Allow and retry" }));
    expect(actions.run).toHaveBeenCalledWith({
      action: "resolve-denial",
      command,
      resolution: "allow"
    });
  });

  it("shows no command choice when the desk refused nothing", () => {
    show({ stage: "needs-you", resumeStage: "build" }, actionsOf());
    expect(screen.queryByRole("radio", { name: /Allow this command/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /Skip it and continue/ })).toBeNull();
  });

  it("recommends telling the builder first, and sends the note to build", async () => {
    const actions = actionsOf();
    show({ stage: "needs-you", resumeStage: "build" }, actions);
    const options = screen.getAllByRole("radio");
    expect(options[0]?.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Tell the builder").closest("label")?.textContent).toBe(
      "Tell the builderRecommended"
    );
    const send = screen.getByRole("button", { name: "Send to the builder" });
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
    expect(
      screen.queryByRole("radio", { name: "Open the agent session in a terminal" })
    ).toBeNull();
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
    await userEvent.click(
      screen.getAllByRole("radio", { name: "Open the agent session in a terminal" }).at(-1) ??
        document.body
    );
    expect(screen.getByText(command)).toBeTruthy();
  });

  it("starts an issue that stopped at intake again, with the override the engineer chooses", async () => {
    const actions = actionsOf();
    show({ stage: "needs-you", resumeStage: "intake" }, actions);
    // Intake cannot continue: no resume select and no Continue.
    expect(screen.queryByRole("combobox", { name: "Resume from" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();

    await userEvent.click(screen.getByRole("checkbox", { name: /ready label/ }));
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
