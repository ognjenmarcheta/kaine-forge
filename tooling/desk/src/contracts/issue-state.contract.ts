import { z } from "zod";

import { isolationSchema } from "./desk-config.contract";
import { feedbackTargetSchema, stageSchema } from "./pipeline.contract";

export const ISSUE_STATE_SCHEMA_VERSION = 1;

export const ISSUE_STATUSES = ["idle", "queued", "running", "waiting", "done", "failed"] as const;
export const issueStatusSchema = z.enum(ISSUE_STATUSES);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

const timestampSchema = z.iso.datetime({ offset: true });

export const historyEventSchema = z
  .object({
    at: timestampSchema,
    stage: stageSchema,
    event: z.string().min(1),
    note: z.string().optional()
  })
  .strict();
export type HistoryEvent = z.infer<typeof historyEventSchema>;

/**
 * Who authorized the run and which issue text they authorized. The engine
 * re-checks this before it ships.
 */
export const authorizationSnapshotSchema = z
  .object({
    actor: z.string().min(1),
    labeledAt: timestampSchema,
    contentFingerprint: z.string().min(1),
    override: z.boolean()
  })
  .strict();
export type AuthorizationSnapshot = z.infer<typeof authorizationSnapshotSchema>;

export const loopCountersSchema = z
  .object({
    check: z.number().int().nonnegative(),
    review: z.number().int().nonnegative()
  })
  .strict();
export type LoopCounters = z.infer<typeof loopCountersSchema>;

export const agentSessionsSchema = z
  .object({
    planner: z.string().min(1).optional(),
    builder: z.string().min(1).optional()
  })
  .strict();
export type AgentSessions = z.infer<typeof agentSessionsSchema>;

/** The agent roles that run as a child process. */
export const AGENT_STAGE_ROLES = ["planner", "builder", "reviewer"] as const;
export const agentStageRoleSchema = z.enum(AGENT_STAGE_ROLES);
export type AgentStageRole = z.infer<typeof agentStageRoleSchema>;

/**
 * The agent child process that runs now. Recovery uses it to stop a process
 * that outlived a crashed desk. `processStart` guards against a reused pid.
 */
export const activeProcessSchema = z
  .object({
    pid: z.number().int().positive(),
    role: agentStageRoleSchema,
    processStart: z.string().min(1).nullable(),
    startedAt: timestampSchema
  })
  .strict();
export type ActiveProcess = z.infer<typeof activeProcessSchema>;

/** Input for the next run of a stage: engineer feedback, a check failure, or review findings. */
export const pendingFeedbackSchema = z
  .object({
    target: feedbackTargetSchema,
    source: z.enum(["human", "check", "review"]),
    text: z.string().min(1)
  })
  .strict();
export type PendingFeedback = z.infer<typeof pendingFeedbackSchema>;

export const issueStateSchema = z
  .object({
    schemaVersion: z.literal(ISSUE_STATE_SCHEMA_VERSION),
    issueNumber: z.number().int().positive(),
    stage: stageSchema,
    status: issueStatusSchema,
    /** Set while the issue sits in `needs-you`: the stage that `continue` re-runs. */
    resumeStage: stageSchema.nullable(),
    branch: z.string().min(1).nullable(),
    worktreePath: z.string().min(1).nullable(),
    sessions: agentSessionsSchema,
    loops: loopCountersSchema,
    /** Fingerprint of the previous failed `check`. Used to stop identical failures early. */
    lastCheckFingerprint: z.string().min(1).nullable(),
    history: z.array(historyEventSchema),
    authorization: authorizationSnapshotSchema.nullable(),
    /**
     * Added in Phase 2. Optional, so a Phase 1 file stays valid and the schema
     * version stays 1. A reader treats a missing field like `null`.
     */
    /** Commit the worktree branch forked from. Every diff is taken against it. */
    baseSha: z
      .string()
      .regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/)
      .nullable()
      .optional(),
    activeProcess: activeProcessSchema.nullable().optional(),
    pendingFeedback: pendingFeedbackSchema.nullable().optional(),
    /**
     * Added in Phase 3. The engineer confirmed the ship. `continue` retries a
     * failed ship only when this is `true`.
     */
    shipConfirmed: z.boolean().optional(),
    /** The ship commit, set when the issue is shipped. */
    commitSha: z
      .string()
      .regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/)
      .nullable()
      .optional(),
    /** The draft PR, set when the issue is shipped. */
    prUrl: z.string().min(1).nullable().optional(),
    prNumber: z.number().int().positive().nullable().optional(),
    /**
     * Added in Phase 5. The isolation the engineer chose for this issue with
     * `desk start --isolation`. Without it the config default applies.
     */
    isolation: isolationSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict();
export type IssueState = z.infer<typeof issueStateSchema>;
