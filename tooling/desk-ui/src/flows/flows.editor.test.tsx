import type { FlowDefinition, FlowView } from "@repo/desk/contracts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeskApiError, type DeskApi } from "../api/api.client";
import { DeskApp } from "../desk.app";
import { INSTALLED, agentDefinition, agentView } from "../test/test.agents";
import { DEFAULT_FLOW_SNAPSHOT } from "../test/test.flow";
import { fakeApi, renderDesk } from "../test/test.render";

const MINE: FlowDefinition = { ...DEFAULT_FLOW_SNAPSHOT.flow, id: "mine", name: "My flow" };

const flowView = (definition: FlowDefinition, source: FlowView["source"]): FlowView => ({
  definition,
  source,
  shadows: null,
  readOnly: source === "builtin",
  hash: "c".repeat(64),
  problems: []
});

const AGENTS = [
  agentView(agentDefinition({ id: "planner", name: "Planner", output: "plan" }), "builtin"),
  agentView(
    agentDefinition({
      id: "builder",
      name: "Builder",
      output: "change",
      capabilities: { preset: "edit-code", mcp: [], skills: [] }
    }),
    "builtin"
  ),
  agentView(agentDefinition({ id: "reviewer", name: "Reviewer", output: "review" }), "builtin")
];

const open = (flows: () => readonly FlowView[], id: string, api: Partial<DeskApi> = {}) => {
  window.history.replaceState(null, "", `?view=flows&flow=${id}`);
  renderDesk(
    <DeskApp />,
    fakeApi({
      flows: () => Promise.resolve({ flows: [...flows()], problems: [] }),
      agents: () => Promise.resolve({ agents: AGENTS, problems: [], installed: INSTALLED }),
      ...api
    })
  );
};

/** The list item of a step, by its heading. */
const stepItem = async (heading: string): Promise<HTMLElement> => {
  const title = await screen.findByRole("heading", { name: heading, level: 3 });
  const item = title.closest("li");
  if (item === null) throw new Error(`no step ${heading}`);
  return item;
};
const headings = (): string[] =>
  screen.getAllByRole("heading", { level: 3 }).map((title) => title.textContent);
/** A card of the canvas, by the start of its label. */
const card = (label: string): HTMLElement =>
  within(screen.getByRole("group", { name: "Flow graph" })).getByRole("group", {
    name: (name) => name.startsWith(label)
  });

afterEach(() => window.history.replaceState(null, "", "/"));

describe("FlowEditor", () => {
  it("keeps the list and the canvas on one draft, and turns Save off with the reason while a rule fails", async () => {
    open(() => [flowView(MINE, "local")], "mine");
    const review = await stepItem("5. Review");

    // The list renames a step; its card on the canvas says the new name.
    const label = within(review).getByLabelText("Label");
    await userEvent.clear(label);
    await userEvent.type(label, "Review it");
    expect(card("Step 5: Review it, Agent")).toBeTruthy();

    expect(headings()[5]).toBe("5. Review it");

    // A key on a card moves its step; the list follows.
    fireEvent.keyDown(card("Step 4: Check"), { key: "ArrowLeft" });
    expect(headings().slice(2, 5)).toEqual(["2. Approve the plan", "3. Check", "4. Build"]);

    // The check's loop back now points forward: the rule fails under Check and on its card.
    expect((await stepItem("3. Check")).textContent).toContain(
      "loopBack.to 'build' must name an earlier step"
    );
    expect(card("Step 3: Check").getAttribute("aria-label")).toBe(
      "Step 3: Check, Check. It has problems."
    );
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveProperty("disabled", true);
    expect(document.getElementById(save.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Save stays off until every problem is fixed."
    );

    // The list's own button moves it back, and the flow is valid again.
    await userEvent.click(screen.getByRole("button", { name: "Move Check down" }));
    expect(headings().slice(2, 5)).toEqual(["2. Approve the plan", "3. Build", "4. Check"]);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
  });

  it("opens a built-in flow read-only, with Clone to edit instead of Save", async () => {
    open(() => [flowView(DEFAULT_FLOW_SNAPSHOT.flow, "builtin")], "kaine-default");
    expect(await screen.findByRole("button", { name: "Clone to edit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add step: Agent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Check up" })).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveProperty("readOnly", true);
    expect(within(await stepItem("4. Check")).getByLabelText("Step id")).toHaveProperty(
      "readOnly",
      true
    );
  });

  it("puts each problem of a refused save under its step", async () => {
    const saveFlow = vi.fn(() =>
      Promise.reject(
        new DeskApiError(
          "invalid-definition",
          422,
          "step 'review': The reviewer cannot run on this checkout\nThe flow does not load."
        )
      )
    );
    open(() => [flowView(MINE, "local")], "mine", { saveFlow });
    const description = await screen.findByLabelText("Description");
    await userEvent.type(description, " Mine.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(saveFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mine",
        description: "Plan, build, check, review, and ship a draft PR. Mine."
      })
    );
    const review = await stepItem("5. Review");
    await waitFor(() =>
      expect(review.textContent).toContain("The reviewer cannot run on this checkout")
    );
    expect((await stepItem("4. Check")).textContent).not.toContain("The reviewer");
    expect(screen.getByText("The flow does not load.").closest(".desk-failure")).not.toBeNull();
  });

  it("promotes only after a yes, and names the uncommitted flow file", async () => {
    let flows = [flowView(MINE, "local")];
    const promoteDefinition = vi.fn(() => {
      flows = [flowView(MINE, "repo")];
      return Promise.resolve({
        kind: "flow" as const,
        id: "mine",
        path: "/repo/.desk/flows/mine.yaml",
        source: "repo" as const,
        shadows: null,
        uncommitted: true
      });
    });
    open(() => flows, "mine", { promoteDefinition });

    await userEvent.click(await screen.findByRole("button", { name: "Promote…" }));
    const ask = screen.getByRole("dialog", { name: "Promote My flow to the repository?" });
    expect(ask.textContent).toContain(".desk/flows/mine.yaml");
    expect(promoteDefinition).not.toHaveBeenCalled();

    await userEvent.click(within(ask).getByRole("button", { name: "Promote" }));
    expect(
      await screen.findByText(
        "Uncommitted: /repo/.desk/flows/mine.yaml. Review the file and commit it like code."
      )
    ).toBeTruthy();
    expect(promoteDefinition.mock.calls).toEqual([["flow", "mine", false]]);
    expect(await screen.findByRole("button", { name: "Edit locally" })).toBeTruthy();
  });
});
