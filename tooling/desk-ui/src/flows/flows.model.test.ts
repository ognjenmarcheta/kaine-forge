import type { AgentDefinition } from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import {
  CANVAS_GAP,
  CANVAS_NODE,
  checkConnect,
  connectBack,
  definitionOf,
  draftOf,
  flowProblems,
  insertStep,
  moveStep,
  removeStep,
  serverProblems,
  slotAt,
  updateStep,
  type FlowDraft
} from "./flows.model";
import { DEFAULT_FLOW_SNAPSHOT } from "../test/test.flow";

const AGENTS: readonly Pick<AgentDefinition, "id" | "output">[] = [
  { id: "planner", output: "plan" },
  { id: "builder", output: "change" },
  { id: "reviewer", output: "review" },
  { id: "notes", output: "report" },
  { id: "intake", output: "intake" }
];

const fresh = (): FlowDraft => draftOf(DEFAULT_FLOW_SNAPSHOT.flow);
const keyOf = (draft: FlowDraft, id: string): string => {
  const step = draft.steps.find((entry) => entry.id === id);
  if (step === undefined) throw new Error(`no step ${id}`);
  return step.key;
};
const ids = (draft: FlowDraft): string[] => draft.steps.map((step) => step.id);
/** The rule messages under the step with `id`. */
const rulesOf = (draft: FlowDraft, id: string): string[] =>
  flowProblems(draft, AGENTS)
    .rules.filter((problem) => problem.key === keyOf(draft, id))
    .map((problem) => problem.message);

describe("the flow draft", () => {
  it("saves the definition it was made from, with nothing changed", () => {
    expect(definitionOf(fresh())).toEqual(DEFAULT_FLOW_SNAPSHOT.flow);
    expect(flowProblems(fresh(), AGENTS)).toEqual({ fields: [], rules: [] });
  });

  it("moves a step and keeps its references by id; one that now points forward is flagged under its step", () => {
    const draft = fresh();
    const moved = moveStep(draft, keyOf(draft, "check"), 1);

    expect(ids(moved)).toEqual([
      "plan",
      "check",
      "plan-gate",
      "build",
      "review",
      "pr-review",
      "ship",
      "pr-open"
    ]);
    expect(definitionOf(moved).steps[1]).toMatchObject({ loopBack: { to: "build", limit: 3 } });
    expect(rulesOf(moved, "check")).toEqual(["loopBack.to 'build' must name an earlier step"]);
    // Moving it back makes the flow valid again.
    expect(flowProblems(moveStep(moved, keyOf(moved, "check"), 3), AGENTS).rules).toEqual([]);
  });

  it("removes a step with the loop backs and send-back targets that named it", () => {
    const draft = fresh();
    const without = definitionOf(removeStep(draft, keyOf(draft, "review")));

    expect(without.steps.map((step) => step.id)).not.toContain("review");
    const gate = without.steps.find((step) => step.id === "pr-review");
    expect(gate).toMatchObject({ kind: "gate", sendBack: ["plan", "build"] });
    // `build` goes too: the check's loop back and the PR wait's `backTo` named it.
    const noBuild = removeStep(draft, keyOf(draft, "build"));
    expect(definitionOf(noBuild).steps.find((step) => step.id === "check")).not.toHaveProperty(
      "loopBack"
    );
    expect(rulesOf(noBuild, "pr-open")).toEqual(["backTo 'build' must name an earlier step"]);
  });

  it("adds a step at an index with a free id; a second one gets the next free id", () => {
    const draft = fresh();
    const at = draft.steps.findIndex((step) => step.id === "review") + 1;
    const once = insertStep(draft, at, { kind: "agent", label: "Notes", agent: "notes" });
    const twice = insertStep(once.draft, at + 1, { kind: "agent", label: "More", agent: "notes" });

    expect(ids(twice.draft).slice(4, 7)).toEqual(["review", "notes", "notes-2"]);
    expect(definitionOf(twice.draft).steps[5]).toEqual({
      id: "notes",
      kind: "agent",
      label: "Notes",
      agent: "notes"
    });
    expect(flowProblems(twice.draft, AGENTS).rules).toEqual([]);
  });

  it("carries every reference along when a step id changes", () => {
    const draft = fresh();
    const renamed = definitionOf(updateStep(draft, keyOf(draft, "build"), { id: "make" }));

    expect(renamed.steps.find((step) => step.id === "check")?.loopBack?.to).toBe("make");
    expect(renamed.steps.find((step) => step.id === "pr-review")).toMatchObject({
      sendBack: ["plan", "make", "review"]
    });
    expect(renamed.steps.find((step) => step.id === "pr-open")).toMatchObject({ backTo: "make" });
  });

  it("connects a step back to an earlier step as a loop back, and refuses a later one", () => {
    const draft = fresh();
    const review = keyOf(draft, "review");
    const plan = keyOf(draft, "plan");

    expect(checkConnect(draft, keyOf(draft, "build"), review)).toEqual({
      ok: false,
      reason: "later"
    });
    expect(connectBack(draft, keyOf(draft, "build"), review, "loopBack")).toBe(draft);

    // A new loop back gets a budget; an existing one keeps it and changes its target.
    const build = keyOf(draft, "build");
    const looped = connectBack(draft, build, plan, "loopBack");
    expect(definitionOf(looped).steps[2]).toMatchObject({ loopBack: { to: "plan", limit: 2 } });
    const retargeted = connectBack(draft, review, plan, "loopBack");
    expect(definitionOf(retargeted).steps[4]).toMatchObject({ loopBack: { to: "plan", limit: 2 } });
  });

  it("offers a gate both of its back edges, and adds a send-back target once", () => {
    const draft = fresh();
    const gate = keyOf(draft, "plan-gate");
    const plan = keyOf(draft, "plan");

    expect(checkConnect(draft, gate, plan)).toEqual({
      ok: true,
      choices: ["loopBack", "sendBack"]
    });
    const sent = connectBack(
      connectBack(draft, keyOf(draft, "pr-review"), keyOf(draft, "check"), "sendBack"),
      keyOf(draft, "pr-review"),
      keyOf(draft, "check"),
      "sendBack"
    );
    expect(definitionOf(sent).steps[5]).toMatchObject({
      sendBack: ["plan", "build", "review", "check"]
    });
  });

  it("reads custom check commands one per line, split at spaces, and flags none", () => {
    const draft = fresh();
    const check = keyOf(draft, "check");
    const custom = updateStep(draft, check, {
      commandSet: "custom",
      commands: "pnpm check\n\n   pnpm  test --run  \n"
    });

    expect(definitionOf(custom).steps[3]).toMatchObject({
      commands: [
        ["pnpm", "check"],
        ["pnpm", "test", "--run"]
      ]
    });
    const empty = updateStep(draft, check, { commandSet: "custom", commands: " \n " });
    expect(flowProblems(empty, AGENTS).fields).toEqual([{ key: check, field: "commands" }]);
  });

  it("puts each problem under its step, and flow-wide rules under the flow", () => {
    const draft = fresh();
    const review = keyOf(draft, "review");
    const broken = updateStep(
      updateStep({ ...draft, name: " " }, review, { label: "", agent: "intake" }),
      keyOf(draft, "pr-open"),
      { maxRounds: "none" }
    );
    const problems = flowProblems(broken, AGENTS);

    expect(problems.fields).toEqual([
      { key: null, field: "name" },
      { key: review, field: "label" },
      { key: keyOf(draft, "pr-open"), field: "maxRounds" }
    ]);
    expect(rulesOf(broken, "review")).toEqual([
      "Agent 'intake' is an intake agent and cannot run in a flow"
    ]);

    const noAgents = { ...draft, steps: draft.steps.filter((step) => step.kind !== "agent") };
    expect(flowProblems(noAgents, AGENTS).rules).toContainEqual({
      key: null,
      message: "A flow needs at least one agent step"
    });
  });

  it("puts the lines of a refused save under the steps they name", () => {
    const draft = fresh();
    expect(
      serverProblems(draft, "step 'ship': Ship needs a remote\nThe flow does not load.")
    ).toEqual([
      { key: keyOf(draft, "ship"), message: "Ship needs a remote" },
      { key: null, message: "The flow does not load." }
    ]);
  });
});

describe("slotAt", () => {
  const center = (column: number): number => column * CANVAS_GAP + CANVAS_NODE.width / 2;

  it("gives the index a step takes among the others, from the center of its card", () => {
    // Dropped just left of the center of step 1 (column 2): it goes before step 1.
    expect(slotAt(center(2) - 1, 4)).toBe(1);
    expect(slotAt(center(0), 4)).toBe(0);
    expect(slotAt(center(9), 4)).toBe(4);
    // Step 3 dragged just left of step 1's center: only step 0 stays before it.
    expect(slotAt(center(2) - 1, 4, 3)).toBe(1);
    // Dragged a little, it keeps its place.
    expect(slotAt(center(4) - 10, 4, 3)).toBe(3);
  });
});
