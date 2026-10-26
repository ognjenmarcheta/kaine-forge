import { z } from "zod";

import { outputOf, type FlowSnapshot } from "./flow-snapshot.contract";

/**
 * What a step does in its flow. The one place that decides it: the engine, the CLI, the server,
 * and the page all read the role and never derive it again. Pure, so the browser gets the same
 * answer from `FlowStepView.role`.
 *
 * - An agent is known by what it produces. Any output other than a plan, a change, or a review
 *   is a report.
 * - A gate right after a plan agent approves the plan (`plan-gate`).
 * - A gate right before a ship the owner confirms reviews the change and ships (`ship-gate`).
 *   Only this gate accepts a ship confirmation. The flow validator refuses a gate that would be
 *   both.
 * - Any other gate approves or sends back (`gate`), also one before an automatic ship.
 */
export const STEP_ROLES = [
  "plan",
  "change",
  "review",
  "report",
  "plan-gate",
  "ship-gate",
  "gate",
  "check",
  "ship",
  "pr-wait"
] as const;
export const stepRoleSchema = z.enum(STEP_ROLES);
export type StepRole = z.infer<typeof stepRoleSchema>;

/** The role of step `id` in the snapshot's flow. `null`: no step has that id. */
export const stepRoleOf = (
  snapshot: FlowSnapshot,
  id: string | null | undefined
): StepRole | null => {
  const { steps } = snapshot.flow;
  const index = steps.findIndex((step) => step.id === id);
  const step = steps[index];
  if (step === undefined) return null;
  switch (step.kind) {
    case "agent": {
      const output = outputOf(snapshot, step);
      return output === "plan" || output === "change" || output === "review" ? output : "report";
    }
    case "gate": {
      const previous = steps[index - 1];
      if (previous !== undefined && outputOf(snapshot, previous) === "plan") return "plan-gate";
      const next = steps[index + 1];
      return next?.kind === "ship" && !next.auto ? "ship-gate" : "gate";
    }
    case "check":
    case "ship":
    case "pr-wait":
      return step.kind;
  }
};
