import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
});
