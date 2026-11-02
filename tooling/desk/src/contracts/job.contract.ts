import { z } from "zod";

import { scorecardRunSchema } from "./scorecard.contract";

/**
 * A desk job: work the owner starts from the desk that is not a GitHub issue, such as a
 * scorecard run. It has its own worktree and branch, runs one fixed flow, and stops at a gate
 * for the owner before anything leaves the machine. See ADR 0021.
 */

export const JOB_KINDS = ["scorecard"] as const;
export const jobKindSchema = z.enum(JOB_KINDS);
export type JobKind = z.infer<typeof jobKindSchema>;

/** The steps of a job, in order. A step the kind does not have is skipped. */
export const JOB_STAGES = ["setup", "sweep", "score", "review", "ship", "done"] as const;
export const jobStageSchema = z.enum(JOB_STAGES);
export type JobStage = z.infer<typeof jobStageSchema>;

/**
 * `running`: a step runs. `waiting`: the job waits at its gate for the owner. `needs-you`: a
 * step stopped, with the reason. `done` and `cancelled` are final.
 */
export const JOB_STATUSES = ["running", "waiting", "needs-you", "done", "cancelled"] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

/** Why a job needs the owner, so the page can say it in words. */
export const JOB_STOP_REASONS = ["failed", "budget", "time", "interrupted"] as const;
export const jobStopReasonSchema = z.enum(JOB_STOP_REASONS);
export type JobStopReason = z.infer<typeof jobStopReasonSchema>;

/** The default cost and time limit of each kind. The owner may change them per job. */
export const JOB_LIMITS: Readonly<Record<JobKind, { costUsd: number; minutes: number }>> = {
  scorecard: { costUsd: 15, minutes: 60 }
};

/** The Claude model a job uses unless the owner picks another one. */
export const JOB_DEFAULT_MODEL = "opus";

const MODEL_PATTERN = /^[a-z0-9][a-z0-9.\-[\]]*$/;

export const jobInputSchema = z
  .object({
    /** What the owner wants the job to look at or to keep in mind. */
    note: z.string().max(2000),
    model: z.string().regex(MODEL_PATTERN).max(80),
    budgetUsd: z.number().positive().max(200),
    minutes: z.number().int().positive().max(240)
  })
  .strict();
export type JobInput = z.infer<typeof jobInputSchema>;

/** One issue the scorer proposes. The owner ticks the ones the desk files. */
export const proposedIssueSchema = z
  .object({
    /** The finding slug in the ledger. */
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    /** `scope: lowercase statement of the defect`. */
    title: z.string().min(1).max(200),
    labels: z.array(z.string().min(1).max(50)).max(8),
    /** The issue body in the six-heading issue format. */
    body: z.string().min(1).max(20_000)
  })
  .strict();
export type ProposedIssue = z.infer<typeof proposedIssueSchema>;

/** What the scorer agent returns. The engine writes the ledger from it. */
export const scorecardJobResultSchema = z
  .object({
    summary: z.string().min(1),
    /** The run to append to the ledger's `runs`, with the whole finding list carried forward. */
    run: scorecardRunSchema,
    /** The bullet lines of this run's calibration note, without the leading "- ". */
    calibration: z.array(z.string().min(1)).max(30),
    proposedIssues: z.array(proposedIssueSchema).max(20),
    /** What the scorer could not decide alone. The owner answers at the gate. */
    openQuestions: z.array(z.string().min(1)).max(10),
    plainLanguage: z.string().min(1)
  })
  .strict();
export type ScorecardJobResult = z.infer<typeof scorecardJobResultSchema>;

export const jobHistoryEntrySchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
    stage: jobStageSchema,
    message: z.string()
  })
  .strict();
export type JobHistoryEntry = z.infer<typeof jobHistoryEntrySchema>;

export const filedIssueSchema = z
  .object({ slug: z.string(), number: z.number().int().positive(), url: z.string() })
  .strict();

export const jobStateSchema = z
  .object({
    schema: z.literal(1),
    id: z.number().int().positive(),
    kind: jobKindSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    input: jobInputSchema,
    status: jobStatusSchema,
    stage: jobStageSchema,
    /** Set while the status is `needs-you`. */
    stop: z.object({ reason: jobStopReasonSchema, detail: z.string() }).strict().nullable(),
    branch: z.string().nullable(),
    worktree: z.string().nullable(),
    /** What the agent runs reported, in dollars. */
    spentUsd: z.number().nonnegative(),
    /** Owner notes sent back from the gate, oldest first. */
    feedback: z.array(z.string()).max(20),
    history: z.array(jobHistoryEntrySchema),
    result: scorecardJobResultSchema.nullable(),
    filedIssues: z.array(filedIssueSchema),
    pr: z.object({ number: z.number().int().positive(), url: z.string() }).strict().nullable()
  })
  .strict();
export type JobState = z.infer<typeof jobStateSchema>;

export const jobListSchema = z.array(jobStateSchema);

/** `POST /api/jobs`. Fields left out take the kind's defaults. */
export const jobStartRequestSchema = z
  .object({
    kind: jobKindSchema,
    note: z.string().max(2000).optional(),
    model: z.string().regex(MODEL_PATTERN).max(80).optional(),
    budgetUsd: z.number().positive().max(200).optional(),
    minutes: z.number().int().positive().max(240).optional()
  })
  .strict();
export type JobStartRequest = z.infer<typeof jobStartRequestSchema>;

/** `POST /api/jobs/:id/actions`. */
export const jobActionRequestSchema = z.discriminatedUnion("action", [
  /** File the ticked issues (by slug), then commit, push, and open the draft PR. */
  z
    .object({
      action: z.literal("approve"),
      issues: z.array(z.string()).max(20),
      confirm: z.literal(true)
    })
    .strict(),
  z.object({ action: z.literal("send-back"), note: z.string().min(1).max(4000) }).strict(),
  /** Run the step that stopped again. */
  z.object({ action: z.literal("continue") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  /** Delete the job, its worktree, and its local branch. A pushed branch stays. */
  z.object({ action: z.literal("remove") }).strict()
]);
export type JobActionRequest = z.infer<typeof jobActionRequestSchema>;
export type JobActionName = JobActionRequest["action"];
