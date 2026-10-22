import { z } from "zod";

import { definitionIdSchema } from "./agent-definition.contract";
import { baseBranchSchema, isolationSchema } from "./desk-config.contract";
import {
  agentOf,
  flowSnapshotSchema,
  isEngineState,
  stageIdSchema,
  stepOf,
  type FlowSnapshot
} from "./flow-snapshot.contract";
import { feedbackTargetSchema, stageSchema } from "./pipeline.contract";

/**
 * Version 2 runs the issue on its own flow snapshot. A version 1 file is read and migrated
 * (`migrateIssueStateV1`); the next normal write stores it as version 2.
 */
export const ISSUE_STATE_SCHEMA_VERSION = 2;

export const ISSUE_STATUSES = ["idle", "queued", "running", "waiting", "done", "failed"] as const;
export const issueStatusSchema = z.enum(ISSUE_STATUSES);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

const timestampSchema = z.iso.datetime({ offset: true });

/** `stage`: the step id or engine state the issue was at. */
export const historyEventSchema = z
  .object({
    at: timestampSchema,
    stage: stageIdSchema,
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

/** Automatic loop-backs so far, by the id of the step that loops back. A missing key reads as 0. */
export const loopCountersSchema = z.record(definitionIdSchema, z.number().int().nonnegative());
export type LoopCounters = z.infer<typeof loopCountersSchema>;

/** The resumable agent session, by agent id. */
export const agentSessionsSchema = z.record(definitionIdSchema, z.string().min(1));
export type AgentSessions = z.infer<typeof agentSessionsSchema>;

/** The agent roles that run as a child process. */
export const AGENT_STAGE_ROLES = ["intake", "planner", "builder", "reviewer"] as const;
export const agentStageRoleSchema = z.enum(AGENT_STAGE_ROLES);
export type AgentStageRole = z.infer<typeof agentStageRoleSchema>;

/**
 * The agent child process that runs now. Recovery uses it to stop a process
 * that outlived a crashed desk. `processStart` guards against a reused pid.
 * `role` is the permission profile, `agentId` the flow agent (absent on version 1 files).
 */
export const activeProcessSchema = z
  .object({
    pid: z.number().int().positive(),
    role: agentStageRoleSchema,
    agentId: definitionIdSchema.optional(),
    processStart: z.string().min(1).nullable(),
    startedAt: timestampSchema
  })
  .strict();
export type ActiveProcess = z.infer<typeof activeProcessSchema>;

/**
 * Input for the next run of a step: engineer feedback, a check failure, review findings, or
 * feedback from the open PR (`pr`, added with the PR feedback loop). `target`: the step that
 * reads it.
 */
export const pendingFeedbackSchema = z
  .object({
    target: stageIdSchema,
    source: z.enum(["human", "check", "review", "pr"]),
    text: z.string().min(1)
  })
  .strict();
export type PendingFeedback = z.infer<typeof pendingFeedbackSchema>;

const shaSchema = z.string().regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/);

/** The fields every schema version shares, with the same meaning. */
const sharedFields = {
  issueNumber: z.number().int().positive(),
  status: issueStatusSchema,
  branch: z.string().min(1).nullable(),
  worktreePath: z.string().min(1).nullable(),
  /** Fingerprint of the previous failed `check`. Used to stop identical failures early. */
  lastCheckFingerprint: z.string().min(1).nullable(),
  authorization: authorizationSnapshotSchema.nullable(),
  /**
   * Added in Phase 2. Optional, so a Phase 1 file stays valid. A reader treats a missing
   * field like `null`.
   */
  /** Commit the worktree branch forked from. Every diff is taken against it. */
  baseSha: shaSchema.nullable().optional(),
  /**
   * Added with the `baseBranch` setting. The branch on `origin` that setup forked from; ship
   * rebases onto it and the PR targets it. A reader treats a missing field like `main`.
   */
  baseBranch: baseBranchSchema.optional(),
  /**
   * Added in Phase 3. The engineer confirmed the ship. `continue` retries a
   * failed ship only when this is `true`.
   */
  shipConfirmed: z.boolean().optional(),
  /** The ship commit, set when the issue is shipped. */
  commitSha: shaSchema.nullable().optional(),
  /** The draft PR, set when the issue is shipped. */
  prUrl: z.string().min(1).nullable().optional(),
  prNumber: z.number().int().positive().nullable().optional(),
  /**
   * Added in Phase 5. The isolation the engineer chose for this issue with
   * `desk start --isolation`. Without it the config default applies.
   */
  isolation: isolationSchema.optional(),
  /**
   * Added with the `pr-open` stage. PR feedback rounds that went back from the open PR.
   * `feedback` and `continue` never reset it. A reader treats a missing field like 0.
   */
  prRounds: z.number().int().nonnegative().optional(),
  /** The PR head commit the desk last pushed or read. */
  prHeadSha: shaSchema.nullable().optional(),
  /**
   * Added with the redesigned desk. The owner's note at the plan approval: the answer to the
   * plan's open questions. The builder reads it. A reader treats a missing field like `null`.
   */
  approveNote: z.string().min(1).nullable().optional(),
  /**
   * The owner asked to hold the issue. The running stage ends, and the engine starts no next
   * stage until `resume`. A reader treats a missing field like `false`.
   */
  pauseRequested: z.boolean().optional(),
  /** When the owner asked for the pause, or `null`. */
  pausedAt: timestampSchema.nullable().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
};

const knownStage = (snapshot: FlowSnapshot, stage: string): boolean =>
  isEngineState(stage) || stepOf(snapshot, stage) !== undefined;

export const issueStateSchema = z
  .object({
    schemaVersion: z.literal(ISSUE_STATE_SCHEMA_VERSION),
    ...sharedFields,
    /** The flow and the agents the issue runs on, frozen at Start. */
    flowSnapshot: flowSnapshotSchema,
    /** A step id of the snapshot, or an engine state. */
    stage: stageIdSchema,
    /** Set while the issue sits in `needs-you`: the stage that `continue` re-runs. */
    resumeStage: stageIdSchema.nullable(),
    sessions: agentSessionsSchema,
    loops: loopCountersSchema,
    history: z.array(historyEventSchema),
    activeProcess: activeProcessSchema.nullable().optional(),
    pendingFeedback: pendingFeedbackSchema.nullable().optional()
  })
  .strict()
  .superRefine((state, context) => {
    const snapshot = state.flowSnapshot;
    const unknown = (path: string[], what: string): void => {
      context.addIssue({ code: "custom", path, message: `${what} is not in the flow snapshot` });
    };
    if (!knownStage(snapshot, state.stage)) unknown(["stage"], `Stage '${state.stage}'`);
    if (state.resumeStage !== null && !knownStage(snapshot, state.resumeStage)) {
      unknown(["resumeStage"], `Stage '${state.resumeStage}'`);
    }
    const target = state.pendingFeedback?.target;
    if (target !== undefined && stepOf(snapshot, target) === undefined) {
      unknown(["pendingFeedback", "target"], `Step '${target}'`);
    }
    for (const step of Object.keys(state.loops)) {
      if (stepOf(snapshot, step) === undefined) unknown(["loops", step], `Step '${step}'`);
    }
    for (const agent of Object.keys(state.sessions)) {
      if (agentOf(snapshot, agent) === undefined) unknown(["sessions", agent], `Agent '${agent}'`);
    }
  });
export type IssueState = z.infer<typeof issueStateSchema>;

// --- version 1 ------------------------------------------------------------

/** A state file from before flow snapshots: the stages, loops and roles of the fixed pipeline. */
export const issueStateV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    ...sharedFields,
    stage: stageSchema,
    resumeStage: stageSchema.nullable(),
    sessions: z
      .object({
        planner: z.string().min(1).optional(),
        builder: z.string().min(1).optional()
      })
      .strict(),
    loops: z
      .object({
        check: z.number().int().nonnegative(),
        review: z.number().int().nonnegative()
      })
      .strict(),
    history: z.array(historyEventSchema.extend({ stage: stageSchema })),
    activeProcess: activeProcessSchema.omit({ agentId: true }).nullable().optional(),
    pendingFeedback: pendingFeedbackSchema
      .extend({ target: feedbackTargetSchema })
      .nullable()
      .optional()
  })
  .strict();
export type IssueStateV1 = z.infer<typeof issueStateV1Schema>;

/**
 * A version 1 state on the built-in default flow. Its step ids are the old stage names, its
 * loop steps `check` and `review` are the old counters, and its agent ids `planner` and
 * `builder` are the old session roles, so every value keeps its meaning.
 */
export const migrateIssueStateV1 = (state: IssueStateV1, snapshot: FlowSnapshot): IssueState => ({
  ...state,
  schemaVersion: ISSUE_STATE_SCHEMA_VERSION,
  flowSnapshot: snapshot,
  sessions: {
    ...(state.sessions.planner === undefined ? {} : { planner: state.sessions.planner }),
    ...(state.sessions.builder === undefined ? {} : { builder: state.sessions.builder })
  },
  loops: { check: state.loops.check, review: state.loops.review }
});
