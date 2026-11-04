import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { IssueHeader } from "./issue.header";
import type { IssueActions } from "../gates/gate.actions";
import type { ActionSettled } from "../state/desk.provider";
import { makeDetail, renderDesk } from "../test/test.render";

const DONE: ActionSettled = {
  kind: "done",
  outcome: { stop: "removed", stage: null, message: null }
};

const actionsOf = (): IssueActions & { run: ReturnType<typeof vi.fn<IssueActions["run"]>> } => {
  const run = vi.fn<IssueActions["run"]>(() => Promise.resolve(DONE));
  return { busy: false, run };
};

const show = (
  stateOverrides: Parameters<typeof makeDetail>[0],
  actions: IssueActions,
  onRemoved: () => void = vi.fn()
) => {
  const { detail, summary } = makeDetail(stateOverrides);
  return renderDesk(
    <IssueHeader
      summary={summary}
      detail={detail}
      graphOpen={false}
      onToggleGraph={vi.fn()}
      actions={actions}
      onRemoved={onRemoved}
    />
  );
};

const openMenuItem = async (name: string) => {
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name }));
};

describe("IssueHeader menu", () => {
  it("asks before it cancels, keeps focus in the dialog, and returns focus to the menu button", async () => {
    const actions = actionsOf();
    show({ stage: "plan-gate" }, actions);
    await openMenuItem("Cancel…");

    const dialog = await screen.findByRole("dialog", { name: "Cancel this run?" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More actions" }));
    expect(actions.run).not.toHaveBeenCalled();

    await openMenuItem("Cancel…");
    await userEvent.click(await screen.findByRole("button", { name: "Cancel the run" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "cancel" });
  });

  it("has no run to cancel once the issue is shipped", async () => {
    show({ stage: "shipped", status: "done" }, actionsOf());
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const cancel = await screen.findByRole("menuitem", { name: "Cancel…" });
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
  });

  it("removes with force only when the box is ticked, then leaves the issue", async () => {
    const actions = actionsOf();
    const onRemoved = vi.fn();
    show({ stage: "cancelled", status: "done" }, actions, onRemoved);

    await openMenuItem("Remove from the desk…");
    await userEvent.click(await screen.findByRole("button", { name: "Remove the issue" }));
    expect(actions.run).toHaveBeenLastCalledWith({ action: "remove", force: false });
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));

    await openMenuItem("Remove from the desk…");
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
    show({ stage: "cancelled", status: "done" }, actions, onRemoved);
    await openMenuItem("Remove from the desk…");
    await userEvent.click(await screen.findByRole("button", { name: "Remove the issue" }));
    await waitFor(() => expect(actions.run).toHaveBeenCalled());
    expect(onRemoved).not.toHaveBeenCalled();
  });
});

describe("IssueHeader time", () => {
  it("shows the active time beside the total once the issue ended", () => {
    const { detail, summary } = makeDetail({ stage: "shipped", status: "done" });
    renderDesk(
      <IssueHeader
        summary={{ ...summary, activeMs: 8 * 60_000 }}
        detail={detail}
        graphOpen={false}
        onToggleGraph={vi.fn()}
        actions={actionsOf()}
        onRemoved={vi.fn()}
      />
    );
    expect(screen.getByText(/took .* · 8m active/)).toBeTruthy();
  });
});

describe("IssueHeader terminal hand-off", () => {
  it("offers to open the agent session in a terminal while a builder runs, and asks first", async () => {
    const actions = actionsOf();
    show({ stage: "build", status: "running" }, actions);
    await openMenuItem("Open the agent session in a terminal…");
    const dialog = await screen.findByRole("dialog", {
      name: "Open the agent session in a terminal?"
    });
    expect(actions.run).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Open in a terminal" }));
    expect(actions.run).toHaveBeenCalledWith({ action: "take-over" });
  });

  it("offers no terminal for the reviewer, whose next run starts a new session", async () => {
    show({ stage: "review", status: "running" }, actionsOf());
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitem", { name: "Copy the branch name" });
    expect(screen.queryByRole("menuitem", { name: /terminal/ })).toBeNull();
  });
});
