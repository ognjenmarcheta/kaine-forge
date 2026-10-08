import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { IssueActions } from "./gate.actions";
import { useGatePanel, type GateLayout, type GatePanelProps } from "./gate.panel";
import type { ActionSettled } from "../state/desk.provider";
import { makeDetail, renderDesk } from "../test/test.render";

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

/** The decision and the bar, in the order the inspector places them. */
function Gate(props: GatePanelProps) {
  const gate = useGatePanel(props);
  return (
    <>
      <p data-testid="placement">{gate.placement}</p>
      {gate.decision}
      {gate.bar}
    </>
  );
}

const show = (
  stateOverrides: Parameters<typeof makeDetail>[0],
  actions: IssueActions,
  extra: {
    onRemoved?: () => void;
    summary?: Parameters<typeof makeDetail>[1];
    layout?: GateLayout;
  } = {}
) => {
  const { detail, summary } = makeDetail(stateOverrides, extra.summary);
  return renderDesk(
    <Gate
      detail={detail}
      summary={summary}
      actions={actions}
      onRemoved={extra.onRemoved ?? vi.fn()}
      layout={extra.layout ?? "side"}
    />
  );
};

const bar = () => screen.getByRole("group");
const decision = () => screen.getByRole("region");

describe("GatePanel at the plan gate", () => {
  it("approves the plan", async () => {
    const actions = actionsOf();
    show({ stage: "plan-gate" }, actions);
    await userEvent.click(screen.getByRole("button", { name: "Approve plan" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "approve" });
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

  it("disables every control that starts work while an action runs, but not Cancel or Remove", async () => {
    show({ stage: "plan-gate" }, actionsOf({ busy: true }));
    expect(screen.getByRole("button", { name: "Approve plan" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Request changes" })).toHaveProperty(
      "disabled",
      true
    );
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Cancel run" })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Remove" }).getAttribute("aria-disabled")
    ).toBeNull();
  });

  it("does not offer approve while the engine works on the issue", () => {
    show({ stage: "build", status: "running" }, actionsOf(), { summary: { busy: true } });
    expect(screen.queryByRole("button", { name: "Approve plan" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Working at: Build");
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

  it("makes the ship the primary action and opens the two-step dialog", async () => {
    show({ stage: "pr-review" }, actionsOf());
    await userEvent.click(screen.getByRole("button", { name: "Ship as draft PR…" }));
    expect(
      await screen.findByRole("dialog", { name: "Ship to a draft pull request" })
    ).toBeTruthy();
  });
});

describe("GatePanel when the desk needs you", () => {
  it("shows the engine's reason as plain text and continues", async () => {
    const actions = actionsOf();
    show({ stage: "needs-you", resumeStage: "build" }, actions, {
      summary: { needsYouReason: "Checks failed <script>window.injected = true</script>" }
    });
    expect(screen.getByText(/Checks failed <script>/)).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
    // The resume select names the stage the engine remembers.
    expect(screen.getByRole("combobox", { name: "Resume from" }).textContent).toContain(
      "Build (the engine remembers it)"
    );
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "continue" });
  });
});

describe("GatePanel after the ship", () => {
  it("links the pull request and says that the engineer merges it", async () => {
    show({ stage: "shipped", status: "done", prUrl: "https://github.com/o/r/pull/9" }, actionsOf());
    const link = screen.getByRole("link", { name: "Open the draft pull request" });
    expect(link.getAttribute("href")).toBe("https://github.com/o/r/pull/9");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.getAllByText(/You merge it yourself/)).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Remove" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Cancel run" })).toBeNull();
  });

  it("never links an address that is not a web link", () => {
    show({ stage: "shipped", status: "done", prUrl: "javascript:alert(1)" }, actionsOf());
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("GatePanel dialogs", () => {
  it("asks before it cancels, keeps focus in the dialog, and returns focus to the button", async () => {
    const actions = actionsOf();
    show({ stage: "plan-gate" }, actions);
    const trigger = screen.getByRole("button", { name: "More actions" });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Cancel run" }));

    const dialog = await screen.findByRole("dialog", { name: "Cancel this run?" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(actions.run).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(actions.run).not.toHaveBeenCalled();

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Cancel run" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel the run" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "cancel" });
  });

  it("removes with force only when the box is ticked, then leaves the issue", async () => {
    const actions = actionsOf();
    const onRemoved = vi.fn();
    show({ stage: "cancelled", status: "done" }, actions, { onRemoved });

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove the issue" }));
    expect(actions.run).toHaveBeenLastCalledWith({ action: "remove", force: false });
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Remove even with changes" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove the issue" }));
    expect(actions.run).toHaveBeenLastCalledWith({ action: "remove", force: true });
  });

  it("keeps the issue on the page when the remove is refused", async () => {
    const actions = actionsOf();
    actions.run.mockResolvedValueOnce({ kind: "error", code: "worktree-dirty", detail: null });
    const onRemoved = vi.fn();
    show({ stage: "cancelled", status: "done" }, actions, { onRemoved });
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove the issue" }));
    await waitFor(() => expect(actions.run).toHaveBeenCalled());
    expect(onRemoved).not.toHaveBeenCalled();
  });
});

describe("GatePanel below 64 rem", () => {
  it("keeps only the actions in the bar and the decision in the page flow, above the stage", async () => {
    const actions = actionsOf();
    show({ stage: "plan-gate" }, actions, { layout: "bar" });
    expect(screen.getByTestId("placement").textContent).toBe("first");
    expect(within(decision()).queryByRole("button", { name: "Approve plan" })).toBeNull();
    expect(decision().textContent).toContain("The planner wrote a plan.");
    // Wide enough: primary, secondary, and the menu share the bar, named by the decision.
    expect(bar().getAttribute("aria-labelledby")).toBe(
      screen.getByRole("heading", { name: "Approve the plan" }).id
    );
    within(bar()).getByRole("button", { name: "Request changes" });
    within(bar()).getByRole("button", { name: "More actions" });
    await userEvent.click(within(bar()).getByRole("button", { name: "Approve plan" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "approve" });
    // Focus goes to the decision heading in the page flow.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Approve the plan" }))
    );
  });

  it("moves the secondary action into the More menu on a narrow screen, and focuses the form", async () => {
    show({ stage: "pr-review" }, actionsOf(), { layout: "bar-narrow" });
    expect(within(bar()).queryByRole("button", { name: "Request changes" })).toBeNull();
    within(bar()).getByRole("button", { name: "Ship as draft PR…" });
    await userEvent.click(within(bar()).getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Request changes" }));
    const box = await within(decision()).findByRole("textbox", { name: "Feedback" });
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it("disables the menu's secondary action while an action runs", async () => {
    show({ stage: "plan-gate" }, actionsOf({ busy: true }), { layout: "bar-narrow" });
    expect(within(bar()).getByRole("button", { name: "Approve plan" })).toHaveProperty(
      "disabled",
      true
    );
    await userEvent.click(within(bar()).getByRole("button", { name: "More actions" }));
    const item = await screen.findByRole("menuitem", { name: "Request changes" });
    expect(item.getAttribute("aria-disabled")).toBe("true");
  });

  it("continues from the stage chosen in the page flow with the bar's button", async () => {
    const actions = actionsOf();
    show({ stage: "needs-you", resumeStage: "build" }, actions, {
      layout: "bar-narrow",
      summary: { needsYouReason: "Checks failed twice" }
    });
    expect(decision().textContent).toContain("Checks failed twice");
    await userEvent.click(within(decision()).getByRole("combobox", { name: "Resume from" }));
    await userEvent.click(await screen.findByRole("option", { name: "Check" }));
    await userEvent.click(within(bar()).getByRole("button", { name: "Continue" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "continue", from: "check" });
  });

  it("has no bar while the engine works: the decision closes the inspector with its menu", () => {
    show({ stage: "build", status: "running" }, actionsOf(), {
      layout: "bar-narrow",
      summary: { busy: true }
    });
    expect(screen.getByTestId("placement").textContent).toBe("last");
    expect(screen.queryByRole("group")).toBeNull();
    within(decision()).getByRole("button", { name: "More actions" });
  });
});
