import { z } from "zod";

import { FLOW_NODE_IDS, flowModelSchema, flowNodeIdSchema, nodeStatusSchema } from "./flow.model";
import { issueStateSchema, issueStatusSchema, loopCountersSchema } from "./issue-state.contract";
import { ACTIVE_STAGES, feedbackTargetSchema, stageSchema } from "./pipeline.contract";

/**
 * Wire contract between the desk server and a browser UI. Browser-safe: this
 * file imports only Zod and other contracts. The server returns codes and
 * raw engine text. It never returns display strings: the UI owns the words.
 */

// --- errors ---------------------------------------------------------------

/**
 * Why the runner refused an action. Mirrors `REFUSALS` in the engine; a server
 * test keeps the two lists equal.
 */
export const REFUSAL_CODES = [
  "leased",
  "unknown-issue",
  "unreadable",
  "invalid-transition",
  "ship-refused",
  "already-started",
  "intake-refused",
  "authorization",
  "worktree-dirty",
  "remove-failed"
] as const;
export const refusalCodeSchema = z.enum(REFUSAL_CODES);
export type RefusalCode = z.infer<typeof refusalCodeSchema>;

/** Failures of the server itself, not of the pipeline. */
export const SERVER_ERROR_CODES = [
  "bad-request",
  "unauthorized",
  "forbidden",
  "not-found",
  "method-not-allowed",
  "payload-too-large",
  "unsupported-media-type",
  /** Another action of this issue still runs. */
  "busy",
  /** The artifact exists in the whitelist but the issue has not written it yet. */
  "artifact-missing",
  "internal"
] as const;

export const API_ERROR_CODES = [...SERVER_ERROR_CODES, ...REFUSAL_CODES] as const;
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: apiErrorCodeSchema,
        /** Raw engine text for a refusal, or `null`. Never a translated string. */
        detail: z.string().nullable()
      })
      .strict()
  })
  .strict();
export type ApiError = z.infer<typeof apiErrorSchema>;

// --- artifacts ------------------------------------------------------------

/** The only artifacts a client can request. The client sends an id, never a path. */
export const ARTIFACT_IDS = [
  "ticket",
  "plan",
  "build",
  "check-report",
  "review",
  "diff",
  "pr-body",
  "ship-plan",
  "log"
] as const;
export const artifactIdSchema = z.enum(ARTIFACT_IDS);
export type ArtifactId = z.infer<typeof artifactIdSchema>;

export const artifactEntrySchema = z
  .object({
    id: artifactIdSchema,
    present: z.boolean(),
    bytes: z.number().int().nonnegative().nullable(),
    updatedAt: z.string().nullable()
  })
  .strict();
export type ArtifactEntry = z.infer<typeof artifactEntrySchema>;

// --- issues ---------------------------------------------------------------

const timestampSchema = z.string().min(1);

export const issueSummarySchema = z.discriminatedUnion("readable", [
  z
    .object({
      readable: z.literal(true),
      issueNumber: z.number().int().positive(),
      /** From `issue.json`. `null` when intake has not written it. */
      title: z.string().nullable(),
      url: z.string().nullable(),
      labels: z.array(z.string()),
      stage: stageSchema,
      status: issueStatusSchema,
      branch: z.string().nullable(),
      loops: loopCountersSchema,
      /** The engine's reason while the issue is in `needs-you`. */
      needsYouReason: z.string().nullable(),
      /** The stage that `continue` re-runs while the issue is in `needs-you`. */
      resumeStage: stageSchema.nullable(),
      /** The draft PR, once the issue shipped. */
      prUrl: z.string().nullable(),
      /** "contract N/6" from `ticket.md`, or `null` before intake wrote it. */
      contract: z
        .object({ found: z.number().int().nonnegative(), total: z.number().int().positive() })
        .strict()
        .nullable(),
      /** When the issue entered its current stage, from the history. `null` when unknown. */
      stageEnteredAt: timestampSchema.nullable(),
      /** Status of every flow node, in `FLOW_NODE_IDS` order (the flow model's own result). */
      progress: z.array(nodeStatusSchema).length(FLOW_NODE_IDS.length),
      /** The flow node that holds the issue now, or `null`. */
      currentNode: flowNodeIdSchema.nullable(),
      /** An action of this issue runs in this server now. */
      busy: z.boolean(),
      createdAt: timestampSchema,
      updatedAt: timestampSchema
    })
    .strict(),
  z
    .object({
      readable: z.literal(false),
      issueNumber: z.number().int().positive(),
      reason: z.string(),
      detail: z.string(),
      busy: z.boolean()
    })
    .strict()
]);
export type IssueSummary = z.infer<typeof issueSummarySchema>;

export const contractProgressSchema = z
  .object({
    found: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    missing: z.array(z.string())
  })
  .strict();
export type ContractProgress = z.infer<typeof contractProgressSchema>;

export const checkSummarySchema = z
  .object({
    passed: z.boolean(),
    kind: z.enum(["loop", "ship"]),
    steps: z.array(
      z
        .object({
          argv: z.array(z.string()),
          code: z.number().int().nullable(),
          timedOut: z.boolean(),
          durationMs: z.number().int().nonnegative()
        })
        .strict()
    ),
    fingerprint: z.string().nullable(),
    diffHash: z.string(),
    generatedDrift: z.boolean(),
    startedAt: timestampSchema,
    finishedAt: timestampSchema
  })
  .strict();
export type CheckSummary = z.infer<typeof checkSummarySchema>;

export const reviewSummarySchema = z
  .object({
    verdict: z.enum(["approve", "changes-requested"]),
    blocking: z.number().int().nonnegative(),
    /** Findings by label: Critical, Consider, Nit, FYI. */
    bySeverity: z
      .object({
        Critical: z.number().int().nonnegative(),
        Consider: z.number().int().nonnegative(),
        Nit: z.number().int().nonnegative(),
        FYI: z.number().int().nonnegative()
      })
      .strict(),
    findings: z.array(
      z
        .object({
          severity: z.enum(["Critical", "Consider", "Nit", "FYI"]),
          blocking: z.boolean(),
          file: z.string(),
          line: z.number().int().positive(),
          section: z.string(),
          summary: z.string(),
          fix: z.string()
        })
        .strict()
    ),
    /** Findings the engine dropped because they point outside the diff. */
    rejected: z.number().int().nonnegative(),
    diffHash: z.string(),
    plainLanguage: z.string()
  })
  .strict();
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

/**
 * What the ship panel shows. `null` means "unknown": the artifact is missing
 * or the server cannot read the worktree diff.
 */
export const shipReadinessSchema = z
  .object({
    /** The issue waits at `pr-review`. */
    atGate: z.boolean(),
    checkPassed: z.boolean().nullable(),
    reviewApproved: z.boolean().nullable(),
    /** The check report and the review saw the same diff. */
    reviewedDiffMatches: z.boolean().nullable(),
    /** The worktree diff equals the checked diff. `null` when the server could not compute it. */
    currentDiffMatches: z.boolean().nullable(),
    /** All known conditions hold. The engine re-checks everything at ship. */
    ready: z.boolean()
  })
  .strict();
export type ShipReadiness = z.infer<typeof shipReadinessSchema>;

export const issueDetailSchema = z
  .object({
    summary: issueSummarySchema,
    state: issueStateSchema,
    flow: flowModelSchema,
    artifacts: z.array(artifactEntrySchema),
    contract: contractProgressSchema.nullable(),
    check: checkSummarySchema.nullable(),
    review: reviewSummarySchema.nullable(),
    ship: shipReadinessSchema
  })
  .strict();
export type IssueDetail = z.infer<typeof issueDetailSchema>;

export const issueListSchema = z.object({ issues: z.array(issueSummarySchema) }).strict();
export type IssueList = z.infer<typeof issueListSchema>;

// --- actions --------------------------------------------------------------

export const ACTION_NAMES = [
  "start",
  "approve",
  "feedback",
  "continue",
  "cancel",
  "remove",
  "ship"
] as const;
export const actionNameSchema = z.enum(ACTION_NAMES);
export type ActionName = z.infer<typeof actionNameSchema>;

export const MAX_FEEDBACK_CHARS = 20_000;

export const actionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), override: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("approve") }).strict(),
  z
    .object({
      action: z.literal("feedback"),
      to: feedbackTargetSchema,
      text: z.string().trim().min(1).max(MAX_FEEDBACK_CHARS)
    })
    .strict(),
  z.object({ action: z.literal("continue"), from: z.enum(ACTIVE_STAGES).optional() }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("remove"), force: z.boolean().default(false) }).strict(),
  z
    .object({
      action: z.literal("ship"),
      confirm: z.boolean(),
      dryRun: z.boolean().default(false)
    })
    .strict()
    // Shipping pushes a branch. A real ship needs an explicit yes.
    .refine((request) => request.confirm || request.dryRun, {
      message: "A ship that is not a dry run needs confirm: true",
      path: ["confirm"]
    })
]);
export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ActionRequestInput = z.input<typeof actionRequestSchema>;

/** How a runner call ended: at a gate, at `needs-you`, or at the end of the issue. */
export const actionOutcomeSchema = z
  .object({
    stop: z.enum(["gate", "needs-you", "shipped", "cancelled", "removed"]),
    stage: stageSchema.nullable(),
    message: z.string().nullable()
  })
  .strict();
export type ActionOutcome = z.infer<typeof actionOutcomeSchema>;

/**
 * `done`: the call ended before the server answered (a quick action).
 * `accepted`: it still runs; the result comes as an `action-result` event.
 * A refusal is never a response here: it is an error envelope with status 409.
 */
export const actionResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("accepted"),
      action: actionNameSchema,
      issueNumber: z.number().int().positive()
    })
    .strict(),
  z
    .object({
      status: z.literal("done"),
      action: actionNameSchema,
      issueNumber: z.number().int().positive(),
      outcome: actionOutcomeSchema
    })
    .strict()
]);
export type ActionResponse = z.infer<typeof actionResponseSchema>;

// --- log and health -------------------------------------------------------

export const LOG_KINDS = ["log", "history", "agent"] as const;
export const logKindSchema = z.enum(LOG_KINDS);
export type LogKind = z.infer<typeof logKindSchema>;

export const logEntrySchema = z
  .object({
    /** Grows by one for every entry of the server. `?after=` reads past it. */
    seq: z.number().int().positive(),
    at: timestampSchema,
    issueNumber: z.number().int().nonnegative(),
    kind: logKindSchema,
    /** Bounded and redacted text, without a time: `at` holds it and the UI formats it. */
    text: z.string()
  })
  .strict();
export type LogEntry = z.infer<typeof logEntrySchema>;

export const logResponseSchema = z
  .object({
    entries: z.array(logEntrySchema),
    /** The newest `seq` of the buffer, or 0. Pass it as `after` for the next read. */
    last: z.number().int().nonnegative()
  })
  .strict();
export type LogResponse = z.infer<typeof logResponseSchema>;

export const healthCheckSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: z.enum(["ok", "warn", "error"]),
    detail: z.string()
  })
  .strict();

export const healthReportSchema = z
  .object({
    ok: z.boolean(),
    checks: z.array(healthCheckSchema),
    generatedAt: timestampSchema
  })
  .strict();
export type HealthReport = z.infer<typeof healthReportSchema>;

// --- server events (SSE) --------------------------------------------------

export const SERVER_EVENT_TYPES = [
  "issue-updated",
  "issue-removed",
  "action-result",
  "log",
  "health"
] as const;

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("issue-updated"), summary: issueSummarySchema }).strict(),
  z.object({ type: z.literal("issue-removed"), issueNumber: z.number().int().positive() }).strict(),
  z
    .object({
      type: z.literal("action-result"),
      issueNumber: z.number().int().positive(),
      action: actionNameSchema,
      /** Exactly one of `outcome` and `error` is set. */
      outcome: actionOutcomeSchema.nullable(),
      error: apiErrorSchema.shape.error.nullable()
    })
    .strict(),
  z.object({ type: z.literal("log"), entry: logEntrySchema }).strict(),
  z.object({ type: z.literal("health"), report: healthReportSchema }).strict()
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;

// --- session --------------------------------------------------------------

/** `POST /api/session`. The one-use launch token comes from the URL fragment. */
export const sessionRequestSchema = z.object({ token: z.string().min(1) }).strict();
export type SessionRequest = z.infer<typeof sessionRequestSchema>;

/** The header every non-GET request needs. A page on another origin cannot set it without a preflight. */
export const DESK_REQUEST_HEADER = "x-desk-request";
export const DESK_REQUEST_HEADER_VALUE = "1";
