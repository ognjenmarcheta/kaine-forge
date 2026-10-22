import { z } from "zod";

import { definitionIdSchema } from "./agent-definition.contract";
import { commandSchema } from "./desk-config.contract";

/**
 * A flow definition: the steps an issue goes through, from a flow file
 * `<id>.yaml`. The built-in `kaine-default` flow is today's pipeline as data,
 * with step ids equal to the stage names. `setup` runs before the first step
 * and is not a step; `intake` stays outside flows; `needs-you`, `shipped` and
 * `cancelled` stay engine states.
 */

export const STEP_KINDS = ["agent", "gate", "check", "ship", "pr-wait"] as const;
export const stepKindSchema = z.enum(STEP_KINDS);
export type StepKind = z.infer<typeof stepKindSchema>;

/** An automatic loop back to an earlier step, with its budget. Human input resets the budget. */
export const loopBackSchema = z
  .object({
    to: definitionIdSchema,
    limit: z.number().int(),
    /** Stop at once when the failure repeats exactly. */
    stopOnSameFailure: z.boolean().optional()
  })
  .strict();
export type LoopBack = z.infer<typeof loopBackSchema>;

/** A named command set of the desk config (`checks.loop`, `checks.ship`). */
export const CHECK_SETS = ["loop", "ship"] as const;

const stepBase = {
  id: definitionIdSchema,
  label: z.string().min(1),
  loopBack: loopBackSchema.optional()
};

const agentStepSchema = z
  .object({ ...stepBase, kind: z.literal("agent"), agent: definitionIdSchema })
  .strict();

/** The owner decides. `sendBack`: earlier steps the owner's feedback may send the work to. */
const gateStepSchema = z
  .object({
    ...stepBase,
    kind: z.literal("gate"),
    sendBack: z.array(definitionIdSchema).default([])
  })
  .strict();

/** A config command set by name, or explicit argv arrays like `checks.loop`. */
const checkStepSchema = z
  .object({
    ...stepBase,
    kind: z.literal("check"),
    commands: z.union([z.enum(CHECK_SETS), z.array(commandSchema).min(1)])
  })
  .strict();

/** `auto`: open the draft PR without the owner's confirmation. */
const shipStepSchema = z
  .object({ ...stepBase, kind: z.literal("ship"), auto: z.boolean().default(false) })
  .strict();

/**
 * The draft PR is open. Review feedback on it sends the work to `backTo`, at most
 * `maxRounds` times. Unlike a loop-back budget, human input never resets the rounds.
 */
const prWaitStepSchema = z
  .object({
    ...stepBase,
    kind: z.literal("pr-wait"),
    maxRounds: z.number().int().min(1),
    backTo: definitionIdSchema
  })
  .strict();

export const flowStepSchema = z.discriminatedUnion("kind", [
  agentStepSchema,
  gateStepSchema,
  checkStepSchema,
  shipStepSchema,
  prWaitStepSchema
]);
export type FlowStep = z.infer<typeof flowStepSchema>;

export const flowDefinitionSchema = z
  .object({
    id: definitionIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    steps: z.array(flowStepSchema).min(1)
  })
  .strict();
export type FlowDefinition = z.infer<typeof flowDefinitionSchema>;
