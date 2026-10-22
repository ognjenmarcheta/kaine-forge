import type { AgentView, FlowDefinition, FlowView } from "@repo/desk/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeskApiError, type DeskApi } from "../api/api.client";
import { DeskApp } from "../desk.app";
import { INSTALLED, agentDefinition, agentView } from "../test/test.agents";
import { DEFAULT_FLOW_SNAPSHOT } from "../test/test.flow";
import { fakeApi, renderDesk } from "../test/test.render";

const LOCAL = agentView(
  agentDefinition({ id: "ui-builder", name: "UI builder", output: "report" }),
  "local"
);
const BUILTIN = agentView(
  agentDefinition({ id: "reviewer", name: "Reviewer", output: "review" }),
  "builtin"
);

const open = (id: string, agents: () => readonly AgentView[], api: Partial<DeskApi> = {}) => {
  window.history.replaceState(null, "", `?view=agents&agent=${id}`);
  renderDesk(
    <DeskApp />,
    fakeApi({
      agents: () => Promise.resolve({ agents: [...agents()], problems: [], installed: INSTALLED }),
      ...api
    })
  );
};

/** The line an element names in `aria-describedby`. */
const descriptionOf = (element: HTMLElement): string =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();

const flowView = (flow: FlowDefinition): FlowView => ({
  definition: flow,
  source: "local",
  shadows: null,
  readOnly: false,
  hash: "b".repeat(64),
  problems: []
});

afterEach(() => window.history.replaceState(null, "", "/"));

describe("AgentEditor", () => {
  it("disables a tool set the output does not allow and says why", async () => {
    open("ui-builder", () => [LOCAL]);
    const editCode = await screen.findByRole("radio", { name: "Edits code" });
    expect(editCode).toHaveProperty("disabled", true);
    expect(descriptionOf(editCode)).toBe("Only a change agent can use this tool set.");

    // A change agent needs edit-code: the output takes it, and the other tool sets close.
    await userEvent.click(screen.getByRole("radio", { name: "Change" }));
    expect(screen.getByRole("radio", { name: "Edits code" }).getAttribute("aria-checked")).toBe(
      "true"
    );
    const readOnly = screen.getByRole("radio", { name: "Read only" });
    expect(readOnly).toHaveProperty("disabled", true);
    expect(descriptionOf(readOnly)).toBe("A change agent needs the Edits code tool set.");
  });

  it("puts each problem of a refused save under its field", async () => {
    const saveAgent = vi.fn(() =>
      Promise.reject(
        new DeskApiError(
          "invalid-definition",
          422,
          "prompt: The prompt asks for a tool the policy floor denies\nThe local agent does not load."
        )
      )
    );
    open("ui-builder", () => [LOCAL], { saveAgent });
    const description = await screen.findByLabelText("Description");
    await userEvent.type(description, " Now longer.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(saveAgent).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Writes the release notes of a change. Now longer." })
    );
    const prompt = screen.getByLabelText("Prompt");
    await waitFor(() => expect(prompt.getAttribute("aria-invalid")).toBe("true"));
    expect(descriptionOf(prompt)).toContain("The prompt asks for a tool the policy floor denies");
    expect(screen.getByRole("alert").textContent).toContain("The local agent does not load.");
  });

  it("promotes only after a yes, asks again before it overwrites, and names the uncommitted file", async () => {
    let agents = [LOCAL];
    const promoteDefinition = vi.fn((_kind: string, _id: string, confirm: boolean) => {
      if (!confirm) {
        return Promise.reject(
          new DeskApiError("definition-refused", 409, "A repo agent 'ui-builder' exists.")
        );
      }
      agents = [{ ...LOCAL, source: "repo" }];
      return Promise.resolve({
        kind: "agent" as const,
        id: "ui-builder",
        path: "/repo/.desk/agents/ui-builder.md",
        source: "repo" as const,
        shadows: null,
        uncommitted: true
      });
    });
    open("ui-builder", () => agents, { promoteDefinition });

    await userEvent.click(await screen.findByRole("button", { name: "Promote…" }));
    const ask = screen.getByRole("dialog", { name: "Promote UI builder to the repository?" });
    expect(ask.textContent).toContain(".desk/agents/ui-builder.md");
    expect(promoteDefinition).not.toHaveBeenCalled();

    await userEvent.click(within(ask).getByRole("button", { name: "Promote" }));
    const overwrite = await screen.findByRole("dialog", {
      name: "Overwrite the repository agent?"
    });
    expect(promoteDefinition.mock.calls).toEqual([["agent", "ui-builder", false]]);

    await userEvent.click(within(overwrite).getByRole("button", { name: "Overwrite" }));
    expect(
      await screen.findByText(
        "Uncommitted: /repo/.desk/agents/ui-builder.md. Review the file and commit it like code."
      )
    ).toBeTruthy();
    expect(promoteDefinition.mock.calls).toEqual([
      ["agent", "ui-builder", false],
      ["agent", "ui-builder", true]
    ]);
  });

  it("names the flows that use an agent when its delete is refused", async () => {
    const steps = DEFAULT_FLOW_SNAPSHOT.flow.steps;
    const uses: FlowDefinition = {
      ...DEFAULT_FLOW_SNAPSHOT.flow,
      id: "design-review",
      name: "Design review",
      steps: steps.map((step) =>
        step.kind === "agent" && step.id === "build" ? { ...step, agent: "ui-builder" } : step
      )
    };
    const deleteDefinition = vi.fn(() =>
      Promise.reject(
        new DeskApiError("definition-refused", 409, "The agent 'ui-builder' is used by a flow.")
      )
    );
    open("ui-builder", () => [LOCAL], {
      deleteDefinition,
      flows: () =>
        Promise.resolve({
          flows: [flowView(DEFAULT_FLOW_SNAPSHOT.flow), flowView(uses)],
          problems: [],
          defaultFlow: "kaine-default"
        })
    });

    await userEvent.click(await screen.findByRole("button", { name: "Delete…" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Delete UI builder?" })).getByRole("button", {
        name: "Delete"
      })
    );
    const refusal = await screen.findByText("Flows use this agent. Change those flows first.");
    const alert = refusal.closest('[role="alert"]');
    if (!(alert instanceof HTMLElement)) throw new Error("no alert");
    expect(
      within(alert)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Design review"]);
    expect(alert.textContent).toContain("The agent 'ui-builder' is used by a flow.");
    expect(window.location.search).toBe("?view=agents&agent=ui-builder");
  });

  it("offers the MCP servers the checkout installed, and marks an asked-for one it lacks", async () => {
    const asks = agentView(
      agentDefinition({
        id: "ui-builder",
        name: "UI builder",
        capabilities: { preset: "read-only", mcp: ["serena", "jira"], skills: [] }
      }),
      "local"
    );
    open("ui-builder", () => [asks], {
      agents: () =>
        Promise.resolve({
          agents: [asks],
          problems: [],
          installed: { mcp: ["context7", "serena"], skills: ["kaine-test"] }
        })
    });

    const legend = (await screen.findAllByText("MCP servers")).find(
      (element) => element.tagName === "LEGEND"
    );
    const servers = legend?.closest("fieldset");
    if (!(servers instanceof HTMLElement)) throw new Error("no MCP servers fieldset");
    const rows = within(servers)
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    // No agent asks for context7: it is listed because the checkout has it.
    expect(rows).toEqual(["context7", "jiraNot installed", "serena"]);
    expect(
      within(servers).getByRole("checkbox", { name: "jira" }).getAttribute("aria-checked")
    ).toBe("true");
    expect(screen.getByRole("checkbox", { name: "kaine-test" })).toBeTruthy();
  });

  it("opens a built-in agent read-only, with Clone to edit instead of Save", async () => {
    open("reviewer", () => [BUILTIN]);
    expect(await screen.findByRole("button", { name: "Clone to edit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveProperty("readOnly", true);
    expect(screen.getByRole("radio", { name: "Review" })).toHaveProperty("disabled", true);
  });
});
