import { describe, expect, it } from "vitest";

import type { FlowSnapshot } from "./flow-snapshot.contract";
import { stepRoleOf, type StepRole } from "./step-role.contract";
import { DEFAULT_SNAPSHOT } from "../testing/flow.testing";

/**
 * The default flow with an automatic ship, and a report agent in place of the reviewer: the
 * gate before the ship is an ordinary gate, and the step of the report agent is a report.
 */
const reviewer = DEFAULT_SNAPSHOT.agents.find((agent) => agent.id === "reviewer");
if (reviewer === undefined) throw new Error("the default flow has a reviewer");
const AUTO_SHIP_SNAPSHOT: FlowSnapshot = {
  ...DEFAULT_SNAPSHOT,
  agents: [...DEFAULT_SNAPSHOT.agents, { ...reviewer, id: "writer", output: "report" }],
  flow: {
    ...DEFAULT_SNAPSHOT.flow,
    steps: DEFAULT_SNAPSHOT.flow.steps.map((step) => {
      if (step.kind === "ship") return { ...step, auto: true };
      if (step.id === "review" && step.kind === "agent") return { ...step, agent: "writer" };
      return step;
    })
  }
};

/** A report agent between steps: `design` after the plan, and a flow that starts with one. */
const withDesign = (steps: FlowSnapshot["flow"]["steps"]): FlowSnapshot => ({
  ...DEFAULT_SNAPSHOT,
  agents: [...DEFAULT_SNAPSHOT.agents, { ...reviewer, id: "design-partner", output: "report" }],
  flow: { ...DEFAULT_SNAPSHOT.flow, steps }
});
const designStep = {
  id: "design",
  kind: "agent",
  label: "Design",
  agent: "design-partner"
} as const;
const REPORT_AFTER_PLAN = withDesign(
  DEFAULT_SNAPSHOT.flow.steps.flatMap((step) => (step.id === "plan" ? [step, designStep] : [step]))
);
const REPORT_FIRST = withDesign([
  designStep,
  { id: "approve", kind: "gate", label: "Approve", sendBack: ["design"] },
  ...DEFAULT_SNAPSHOT.flow.steps
]);

describe("stepRoleOf", () => {
  const cases: readonly {
    readonly flow: string;
    readonly snapshot: FlowSnapshot;
    readonly step: string;
    readonly role: StepRole | null;
  }[] = [
    { flow: "default", snapshot: DEFAULT_SNAPSHOT, step: "plan", role: "plan" },
    { flow: "default", snapshot: DEFAULT_SNAPSHOT, step: "plan-gate", role: "plan-gate" },
    { flow: "default", snapshot: DEFAULT_SNAPSHOT, step: "build", role: "change" },
    { flow: "default", snapshot: DEFAULT_SNAPSHOT, step: "check", role: "check" },
    { flow: "default", snapshot: DEFAULT_SNAPSHOT, step: "review", role: "review" },
    { flow: "default", snapshot: DEFAULT_SNAPSHOT, step: "pr-review", role: "ship-gate" },
    { flow: "default", snapshot: DEFAULT_SNAPSHOT, step: "ship", role: "ship" },
    { flow: "default", snapshot: DEFAULT_SNAPSHOT, step: "pr-open", role: "pr-wait" },
    { flow: "default", snapshot: DEFAULT_SNAPSHOT, step: "needs-you", role: null },
    { flow: "auto-ship", snapshot: AUTO_SHIP_SNAPSHOT, step: "review", role: "report" },
    { flow: "auto-ship", snapshot: AUTO_SHIP_SNAPSHOT, step: "pr-review", role: "gate" },
    {
      flow: "plan, report, gate",
      snapshot: REPORT_AFTER_PLAN,
      step: "plan-gate",
      role: "plan-gate"
    },
    { flow: "report, gate", snapshot: REPORT_FIRST, step: "approve", role: "gate" }
  ];

  it.each(cases)("$flow flow: '$step' is $role", ({ snapshot, step, role }) => {
    expect(stepRoleOf(snapshot, step)).toBe(role);
  });
});
