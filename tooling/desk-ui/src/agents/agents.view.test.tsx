import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeskApiError, type DeskApi } from "../api/api.client";
import { DeskApp } from "../desk.app";
import { INSTALLED, agentDefinition, agentView } from "../test/test.agents";
import { fakeApi, renderDesk } from "../test/test.render";

const rowOf = async (name: string): Promise<HTMLElement> => {
  const heading = await screen.findByRole("heading", { name, level: 2 });
  const row = heading.closest("li");
  if (row === null) throw new Error(`no row for ${name}`);
  return row;
};

beforeEach(() => window.history.replaceState(null, "", "?view=agents"));
afterEach(() => window.history.replaceState(null, "", "/"));

describe("AgentsView", () => {
  it("says where each agent comes from, what it overrides, and that a built-in is read-only", async () => {
    const agents = [
      agentView(agentDefinition({ id: "reviewer", name: "Reviewer", output: "review" }), "builtin"),
      agentView(agentDefinition({ id: "notes", name: "Release notes" }), "repo"),
      agentView(
        agentDefinition({ id: "planner", name: "My planner", output: "plan", model: "opus" }),
        "local",
        "builtin"
      )
    ];
    renderDesk(
      <DeskApp />,
      fakeApi({ agents: () => Promise.resolve({ agents, problems: [], installed: INSTALLED }) })
    );

    const reviewer = await rowOf("Reviewer");
    expect(within(reviewer).getByText("Built-in")).toBeTruthy();
    expect(within(reviewer).getByText("Read-only")).toBeTruthy();

    const notes = await rowOf("Release notes");
    expect(within(notes).getByText("Repository")).toBeTruthy();
    expect(within(notes).queryByText("Read-only")).toBeNull();
    expect(within(notes).queryByText(/^Overrides/)).toBeNull();

    const planner = await rowOf("My planner");
    expect(within(planner).getByText("Local")).toBeTruthy();
    expect(within(planner).getByText("Overrides Built-in")).toBeTruthy();
    expect(within(planner).getByText("Claude · opus")).toBeTruthy();
    expect(
      within(planner).getByRole("link", { name: "Open My planner" }).getAttribute("href")
    ).toBe("?view=agents&agent=planner");
  });

  it("runs a report agent from its row, and the start form lists only report agents that change no file", async () => {
    const agents = [
      agentView(
        agentDefinition({ id: "product-strategist", name: "Product strategist" }),
        "builtin"
      ),
      agentView(
        agentDefinition({
          id: "dx-checker",
          name: "DX checker",
          capabilities: { preset: "run-checks", mcp: [], skills: [], tools: [] }
        }),
        "repo"
      ),
      agentView(
        agentDefinition({
          id: "fixer",
          name: "Fixer",
          capabilities: { preset: "edit-code", mcp: [], skills: [], tools: [] }
        }),
        "local"
      ),
      agentView(agentDefinition({ id: "reviewer", name: "Reviewer", output: "review" }), "builtin")
    ];
    const startJob = vi.fn<DeskApi["startJob"]>(() =>
      Promise.reject(new DeskApiError("busy", 409, null))
    );
    renderDesk(
      <DeskApp />,
      fakeApi({
        agents: () => Promise.resolve({ agents, problems: [], installed: INSTALLED }),
        startJob
      })
    );

    expect(within(await rowOf("Fixer")).queryByRole("button", { name: "Run Fixer" })).toBeNull();
    expect(
      within(await rowOf("Reviewer")).queryByRole("button", { name: "Run Reviewer" })
    ).toBeNull();
    await userEvent.click(
      within(await rowOf("DX checker")).getByRole("button", { name: "Run DX checker" })
    );

    const dialog = await screen.findByRole("dialog", { name: "New work" });
    expect(
      within(dialog)
        .getByRole("radio", { name: /^Run a specialist/ })
        .getAttribute("aria-checked")
    ).toBe("true");
    const picker = await within(dialog).findByRole("combobox", { name: "Agent" });
    expect(picker.textContent).toBe("DX checker");
    await userEvent.click(picker);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Product strategist",
      "DX checker"
    ]);
    await userEvent.click(screen.getByRole("option", { name: "Product strategist" }));
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Path in the repository" }),
      "apps/web/src/features/todos"
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));

    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "specialist",
        specialist: {
          agentId: "product-strategist",
          target: { kind: "path", value: "apps/web/src/features/todos" }
        }
      })
    );
  });
});
