import { z } from "zod";

import { isolationSchema, providerSchema } from "./desk-config.contract";
import { agentStageRoleSchema, loopCountersSchema } from "./issue-state.contract";

/** The runner's failure kinds, plus `stuck`: the engine stopped a run that repeated a failing call. */
export const RUN_FAILURE_KINDS = [
  "timeout",
  "process-error",
  "no-result",
  "schema-mismatch",
  "aborted",
  "stuck"
] as const;

const count = z.number().int().nonnegative();

/**
 * One agent run, as a line of `<state>/runs.jsonl`. The file is shared by all issues
 * and outlives `remove`, so runs of different models can be compared. It holds
 * numbers and names only: no prompt, no output, no path.
 */
export const runRecordSchema = z
  .object({
    schema: z.literal(1),
    at: z.iso.datetime({ offset: true }),
    issue: z.number().int().positive(),
    role: agentStageRoleSchema,
    provider: providerSchema,
    /** `null`: the CLI's default model. */
    model: z.string().min(1).nullable(),
    isolation: isolationSchema,
    /** The loop counters when the run started. */
    loops: loopCountersSchema,
    durationMs: count,
    /** The runner returned a result that matches the role schema. */
    ok: z.boolean(),
    /** The stage accepted the run: the engine invariants and the verification held. */
    accepted: z.boolean(),
    failureKind: z.enum(RUN_FAILURE_KINDS).nullable(),
    usage: z
      .object({ inputTokens: count, cachedInputTokens: count, outputTokens: count })
      .strict()
      .nullable(),
    costUsd: z.number().nonnegative().nullable(),
    /** Claude reports turns. Codex does not. */
    turns: count.nullable(),
    toolCalls: count,
    /** Edit and write calls. Many of them for few files means the agent patched again and again. */
    editCalls: count,
    failedToolCalls: count,
    denials: count
  })
  .strict();
export type RunRecord = z.infer<typeof runRecordSchema>;
