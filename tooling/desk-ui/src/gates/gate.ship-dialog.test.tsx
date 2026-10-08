import type { ShipPlanView } from "@repo/desk/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { IssueActions } from "./gate.actions";
import { ShipDialog } from "./gate.ship-dialog";
import type { ActionSettled } from "../state/desk.provider";
import { fakeApi, renderDesk } from "../test/test.render";

const plan = (overrides: Partial<ShipPlanView> = {}): ShipPlanView => ({
  dryRun: true,
  branch: "KAINE-7-feat-thing",
  gate: { ok: true, failures: [] },
  changeset: { kind: "file", reason: "A package changed" },
  changesetText: '---\n"@repo/web": patch\n---\n\nAdd a thing.\n',
  commitHeader: "feat(web): add a thing",
  pullRequest: { title: "feat(web): add a thing" },
  files: ["apps/web/src/a.ts", ".changeset/thing.md"],
  unfilledHeadings: [],
  ...overrides
});

const DONE: ActionSettled = {
  kind: "done",
  outcome: { stop: "gate", stage: "pr-review", message: null }
};

const setup = (
  shipPlan: ShipPlanView,
  ship: ActionSettled = {
    kind: "done",
    outcome: { stop: "shipped", stage: "shipped", message: null }
  }
) => {
  const run = vi.fn<IssueActions["run"]>((request) =>
    Promise.resolve(request.action === "ship" && request.dryRun !== true ? ship : DONE)
  );
  const api = fakeApi({
    artifactJson: (_issue, _id, schema) => Promise.resolve(schema.parse(shipPlan)),
    artifactText: () => Promise.resolve("## Summary\nBody <b>text</b>")
  });
  const onOpenChange = vi.fn();
  renderDesk(
    <ShipDialog issueNumber={7} open onOpenChange={onOpenChange} actions={{ busy: false, run }} />,
    api
  );
  return { run, onOpenChange };
};

describe("ShipDialog", () => {
  it("runs a dry run first and shows what the ship would do, without shipping", async () => {
    const { run } = setup(plan());
    const dialog = await screen.findByRole("dialog", { name: "Ship to a draft pull request" });
    await screen.findByText("Every ship rule passes.");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ action: "ship", confirm: false, dryRun: true });

    expect(dialog.textContent).toContain("feat(web): add a thing");
    expect(dialog.textContent).toContain("KAINE-7-feat-thing");
    expect(dialog.textContent).toContain("Changeset file");
    expect(dialog.textContent).toContain("apps/web/src/a.ts");
    expect(dialog.textContent).toContain("Files in the commit (2)");
    expect(dialog.textContent).toContain("A draft against main");
  });

  it("asks for a second yes, and only that yes sends confirm: true", async () => {
    const { run } = setup(plan());
    await userEvent.click(await screen.findByRole("button", { name: "Continue to confirm" }));
    expect(screen.getByText(/commits 2 files on KAINE-7-feat-thing/)).toBeTruthy();
    expect(run).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Confirm and ship" }));
    await screen.findByText("Shipped. The draft pull request is open.");
    expect(run).toHaveBeenLastCalledWith({ action: "ship", confirm: true, dryRun: false });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("blocks the confirm step while a gate rule fails, and lists the failure", async () => {
    const { run } = setup(
      plan({
        gate: { ok: false, failures: [{ kind: "check-stale", message: "The worktree changed." }] }
      })
    );
    expect(await screen.findByText("The worktree changed.")).toBeTruthy();
    expect(screen.getByText("check-stale")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue to confirm" })).toHaveProperty(
      "disabled",
      true
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("goes back from the confirm step to a fresh dry run", async () => {
    const { run } = setup(plan());
    await userEvent.click(await screen.findByRole("button", { name: "Continue to confirm" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Every ship rule passes.");
    expect(run).toHaveBeenCalledTimes(2);
    expect(
      run.mock.calls.every(([request]) => request.action === "ship" && request.dryRun === true)
    ).toBe(true);
  });

  it("shows a refused ship and offers another dry run", async () => {
    setup(plan(), { kind: "error", code: "ship-refused", detail: "Gate: the diff changed" });
    await userEvent.click(await screen.findByRole("button", { name: "Continue to confirm" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm and ship" }));
    expect(await screen.findByText("The ship was refused. Nothing was changed.")).toBeTruthy();
    expect(screen.getByText("Gate: the diff changed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run the dry run again" })).toBeTruthy();
  });

  it("keeps focus inside the dialog and closes on Escape before the ship starts", async () => {
    const { onOpenChange } = setup(plan());
    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows engine text as text", async () => {
    setup(plan({ commitHeader: "feat: <img src=x onerror=alert(1)>" }));
    expect(await screen.findByText("feat: <img src=x onerror=alert(1)>")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});
