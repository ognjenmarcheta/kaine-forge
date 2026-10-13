import { z } from "zod";

import { isolationSchema, providerSchema } from "./desk-config.contract";
import { agentStageRoleSchema, loopCountersSchema } from "./issue-state.contract";
import { stageSchema } from "./pipeline.contract";

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
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * The instructions a run started with. `repo` hashes what the agent reads in its checkout
 * (project instructions, role definitions, review checklist, permission rules, installed
 * skills), `desk` the desk's own role file and rules. Equal hashes mean equal instructions.
 */
export const harnessFingerprintSchema = z
  .object({
    repo: sha256,
    desk: sha256,
    /** The checkout's commit when the run started. */
    head: z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/)
  })
  .strict();
export type HarnessFingerprint = z.infer<typeof harnessFingerprintSchema>;

/** Hash length shown and grouped on: enough to tell harness versions apart. */
export const HARNESS_SHORT_LENGTH = 12;

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
    /** `inputTokens` excludes cache reads; the total input is `inputTokens + cachedInputTokens`. */
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
    denials: count,
    /** `null` when it could not be read, and on records written before it existed. */
    harness: harnessFingerprintSchema.nullable().default(null)
  })
  .strict();
export type RunRecord = z.infer<typeof runRecordSchema>;

const mean = z.number().nonnegative().nullable();

/** Runs of one role with one provider and model. Means and totals cover only the runs that report the value. */
export const runGroupSchema = z
  .object({
    role: agentStageRoleSchema,
    provider: providerSchema,
    /** `null`: the CLI's default model. */
    model: z.string().min(1).nullable(),
    runs: count,
    /** Runs the stage accepted (result, invariants and verification held). */
    accepted: count,
    stuck: count,
    timeouts: count,
    medianDurationMs: z.number().nonnegative(),
    /** Total input: fresh and cached. */
    meanInputTokens: mean,
    meanOutputTokens: mean,
    totalCostUsd: mean,
    meanCostUsd: mean,
    meanTurns: mean,
    meanEditCalls: z.number().nonnegative(),
    /**
     * Set when the runs are also grouped by harness: the short `repo` and `desk` hashes.
     * `null` otherwise, and for runs recorded without a fingerprint.
     */
    harness: z
      .object({
        repo: z.string().length(HARNESS_SHORT_LENGTH),
        desk: z.string().length(HARNESS_SHORT_LENGTH)
      })
      .strict()
      .nullable()
      .default(null)
  })
  .strict();
export type RunGroup = z.infer<typeof runGroupSchema>;

/** One issue: where it stands and what its runs cost. */
export const issueRollupSchema = z
  .object({
    issue: z.number().int().positive(),
    /** `null` when the issue was removed: its runs stay in the record. */
    stage: stageSchema.nullable(),
    loops: loopCountersSchema.nullable(),
    runs: count,
    totalCostUsd: mean
  })
  .strict();
export type IssueRollup = z.infer<typeof issueRollupSchema>;

/** `desk stats --json` and `GET /api/stats`. */
export const runStatsSchema = z
  .object({
    groups: z.array(runGroupSchema),
    issues: z.array(issueRollupSchema),
    /** Lines of `runs.jsonl` that were skipped because they are not a valid record. */
    invalidLines: count
  })
  .strict();
export type RunStats = z.infer<typeof runStatsSchema>;
