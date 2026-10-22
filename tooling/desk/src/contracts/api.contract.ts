import { z } from "zod";

import {
  agentDefinitionSchema,
  agentOutputKindSchema,
  definitionIdSchema
} from "./agent-definition.contract";
import { planRiskSchema } from "./agent-output.contract";
import { capabilityProfileSchema } from "./capability-profile.contract";
import { providerSchema } from "./desk-config.contract";
import {
  flowDefinitionSchema,
  stepKindSchema,
  type FlowDefinition,
  type StepKind
} from "./flow-definition.contract";
import {
  agentOf,
  definitionSourceSchema,
  isEngineState,
  stageIdSchema,
  type FlowSnapshot
} from "./flow-snapshot.contract";
import { flowModelSchema, flowNodeIdSchema, nodeStatusSchema } from "./flow.model";
import { issueStateSchema, issueStatusSchema, loopCountersSchema } from "./issue-state.contract";
import { runRecordSchema } from "./run-metrics.contract";

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
  "draft-refused",
  "refresh-refused",
  "pr-refused",
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
  /** A lesson action refused: the lesson changed since the preview, it has an issue, or GitHub failed. */
  "lesson-refused",
  /** An agent or flow does not validate. `detail` lists every problem, one per line. Nothing was written. */
  "invalid-definition",
  /** A write to the agents and flows refused: the id exists, is not local, or a flow uses it. */
  "definition-refused",
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
  "issue-draft",
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

/**
 * One step of the issue's flow as the UI names it. `agent`: the agent of an agent step.
 * `sendBack`: where a gate's feedback may go (empty for other kinds). `auto`: a ship step that
 * opens the PR without the owner (false for other kinds).
 */
export const flowStepViewSchema = z
  .object({
    id: definitionIdSchema,
    label: z.string().min(1),
    kind: stepKindSchema,
    agent: z
      .object({ id: definitionIdSchema, name: z.string().min(1), output: agentOutputKindSchema })
      .strict()
      .nullable(),
    sendBack: z.array(definitionIdSchema),
    auto: z.boolean()
  })
  .strict();
export type FlowStepView = z.infer<typeof flowStepViewSchema>;

/** The steps of a flow snapshot as the UI sees them. Pure, so the server and a test agree. */
export const flowStepViewsOf = (snapshot: FlowSnapshot): FlowStepView[] =>
  snapshot.flow.steps.map((step) => {
    const agent = step.kind === "agent" ? agentOf(snapshot, step.agent) : undefined;
    return {
      id: step.id,
      label: step.label,
      kind: step.kind,
      agent: agent === undefined ? null : { id: agent.id, name: agent.name, output: agent.output },
      sendBack: step.kind === "gate" ? [...step.sendBack] : [],
      auto: step.kind === "ship" && step.auto
    };
  });

/** The flow an issue runs on, from its snapshot: what the owner sees of it. */
export const flowDefinitionViewSchema = z
  .object({
    id: definitionIdSchema,
    name: z.string().min(1),
    hash: z.string().min(1),
    source: definitionSourceSchema,
    steps: z.array(flowStepViewSchema)
  })
  .strict();
export type FlowDefinitionView = z.infer<typeof flowDefinitionViewSchema>;

export const issueSummarySchema = z.discriminatedUnion("readable", [
  z
    .object({
      readable: z.literal(true),
      issueNumber: z.number().int().positive(),
      /** From `issue.json`. `null` when intake has not written it. */
      title: z.string().nullable(),
      url: z.string().nullable(),
      labels: z.array(z.string()),
      /** A step id of the issue's flow, or an engine state. */
      stage: stageIdSchema,
      status: issueStatusSchema,
      branch: z.string().nullable(),
      loops: loopCountersSchema,
      /** PR feedback rounds that went back to `build`, and the config limit for them. */
      prRound: z.number().int().nonnegative(),
      prRoundLimit: z.number().int().positive(),
      /** The engine's reason while the issue is in `needs-you`. */
      needsYouReason: z.string().nullable(),
      /** The stage that `continue` re-runs while the issue is in `needs-you`. */
      resumeStage: stageIdSchema.nullable(),
      /** The draft PR, once the ship opened it. */
      prUrl: z.string().nullable(),
      /** "contract N/6" from `ticket.md`, or `null` before intake wrote it. */
      contract: z
        .object({ found: z.number().int().nonnegative(), total: z.number().int().positive() })
        .strict()
        .nullable(),
      /** When the issue entered its current stage, from the history. `null` when unknown. */
      stageEnteredAt: timestampSchema.nullable(),
      /** Status of every flow node, in flow order (the flow model's own result): the ticket and the steps. */
      progress: z.array(nodeStatusSchema).min(2),
      /** The flow node that holds the issue now, or `null`. */
      currentNode: flowNodeIdSchema.nullable(),
      /** An action of this issue runs in this server now. */
      busy: z.boolean(),
      /**
       * The owner asked to hold the issue. While `busy`, the running stage still ends; then the
       * issue waits until `resume`.
       */
      paused: z.boolean(),
      pausedAt: timestampSchema.nullable(),
      /** The risk of the current plan, or `null` before a graded plan exists. */
      planRisk: planRiskSchema.nullable(),
      /** The flow the issue runs on, from its snapshot, and the snapshot's hash. */
      flowId: definitionIdSchema,
      flowName: z.string().min(1),
      flowHash: z.string().min(1),
      /** Where the flow file came from, and its steps: a board names and places a stage with them. */
      flowSource: definitionSourceSchema,
      flowSteps: z.array(flowStepViewSchema).min(1),
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

/** The plan the gate shows: its grade and what the latest revision changed. */
export const planSummarySchema = z
  .object({
    risk: planRiskSchema.nullable(),
    riskReasons: z.array(z.string()),
    revision: z.string().nullable()
  })
  .strict();
export type PlanSummary = z.infer<typeof planSummarySchema>;

/**
 * One agent session the owner can resume by hand. `provider` is the CLI that ran the latest run
 * of the role, from its run summary (`null` when unknown). `command` is what `desk resume` prints:
 * `cd <worktree> && claude --resume <id>` or `... && codex resume <id>`, `null` without a provider.
 */
export const agentSessionSchema = z
  .object({
    role: z.enum(["planner", "builder"]),
    sessionId: z.string().min(1),
    provider: providerSchema.nullable(),
    command: z.string().nullable()
  })
  .strict();
export type AgentSession = z.infer<typeof agentSessionSchema>;

export const sessionResumeSchema = z
  .object({
    worktreePath: z.string().nullable(),
    sessions: z.array(agentSessionSchema)
  })
  .strict();
export type SessionResume = z.infer<typeof sessionResumeSchema>;

export const issueDetailSchema = z
  .object({
    summary: issueSummarySchema,
    state: issueStateSchema,
    flow: flowModelSchema,
    /** The steps of the issue's flow snapshot, with their labels and agents. */
    flowDefinition: flowDefinitionViewSchema,
    artifacts: z.array(artifactEntrySchema),
    contract: contractProgressSchema.nullable(),
    check: checkSummarySchema.nullable(),
    review: reviewSummarySchema.nullable(),
    ship: shipReadinessSchema,
    /** From `plan.json`. `null` before the plan exists. */
    plan: planSummarySchema.nullable(),
    /** What the latest build changed since the one before, from `build.json`. `null` for a first build. */
    buildRevision: z.string().nullable(),
    /** The owner's note at the plan approval, or `null`. */
    approveNote: z.string().nullable(),
    resume: sessionResumeSchema,
    /** The agent runs of this issue from `runs.jsonl`, oldest first. */
    runs: z.array(runRecordSchema)
  })
  .strict();
export type IssueDetail = z.infer<typeof issueDetailSchema>;

export const issueListSchema = z.object({ issues: z.array(issueSummarySchema) }).strict();
export type IssueList = z.infer<typeof issueListSchema>;

// --- agents and flows --------------------------------------------------------

/** A definition file that does not parse or validate. It takes part in nothing. */
export const definitionProblemSchema = z
  .object({
    /** Absolute path of the file. */
    path: z.string().min(1),
    source: definitionSourceSchema,
    /** Engine text, one entry per error. */
    errors: z.array(z.string())
  })
  .strict();
export type DefinitionProblem = z.infer<typeof definitionProblemSchema>;

/** How a registry entry won its id: read-only in this stage. */
const definitionEntryFields = {
  source: definitionSourceSchema,
  /** The source of the definition with the same id that this one overrides, or `null`. */
  shadows: definitionSourceSchema.nullable(),
  /** A built-in definition changes only with the desk. Override the id to change one. */
  readOnly: z.boolean(),
  /** sha256 of the normalized definition. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  /** Files with this id that do not load, for example a broken override. */
  problems: z.array(definitionProblemSchema)
};

/** `GET /api/agents/:id`: an agent with the capabilities a run gets with the desk's config now. */
export const agentViewSchema = z
  .object({
    definition: agentDefinitionSchema,
    ...definitionEntryFields,
    /** Resolved for the configured provider and isolation, with no workspace check commands. */
    resolved: capabilityProfileSchema
  })
  .strict();
export type AgentView = z.infer<typeof agentViewSchema>;

/**
 * `GET /api/agents`. `problems`: every agent file that does not load. `installed`: the MCP
 * servers and skills this checkout has; the resolver removes any other name an agent asks for.
 */
export const agentListSchema = z
  .object({
    agents: z.array(agentViewSchema),
    problems: z.array(definitionProblemSchema),
    installed: z.object({ mcp: z.array(z.string()), skills: z.array(z.string()) }).strict()
  })
  .strict();
export type AgentList = z.infer<typeof agentListSchema>;

/** `GET /api/flows/:id`. */
export const flowViewSchema = z
  .object({ definition: flowDefinitionSchema, ...definitionEntryFields })
  .strict();
export type FlowView = z.infer<typeof flowViewSchema>;

/**
 * `GET /api/flows`. `problems`: every flow file that does not load or validate. `defaultFlow`:
 * the configured `defaultFlow`, the flow `start` picks when no flow label matches.
 */
export const flowListSchema = z
  .object({
    flows: z.array(flowViewSchema),
    problems: z.array(definitionProblemSchema),
    defaultFlow: definitionIdSchema
  })
  .strict();
export type FlowList = z.infer<typeof flowListSchema>;

// --- agent and flow writes --------------------------------------------------

export const DEFINITION_KINDS = ["agent", "flow"] as const;
export const definitionKindSchema = z.enum(DEFINITION_KINDS);
export type DefinitionKind = z.infer<typeof definitionKindSchema>;

/** `PUT /api/agents/:id`: save to `.ai.local/desk/agents/<id>.md`. The path id must equal `definition.id`. */
export const agentSaveRequestSchema = z.object({ definition: agentDefinitionSchema }).strict();
/** `PUT /api/flows/:id`: save to `.ai.local/desk/flows/<id>.yaml`. */
export const flowSaveRequestSchema = z.object({ definition: flowDefinitionSchema }).strict();

/** `POST /api/{agents,flows}/:id/clone`: a local copy under a new id. `name` defaults to "<name> (copy)". */
export const definitionCloneRequestSchema = z
  .object({ id: definitionIdSchema, name: z.string().trim().min(1).optional() })
  .strict();

/** `POST /api/{agents,flows}/:id/promote`. `confirm: true` overwrites a repo file of the same id. */
export const definitionPromoteRequestSchema = z
  .object({ confirm: z.boolean().default(false) })
  .strict();

/** The answer to every agent and flow write. */
export const definitionWriteResultSchema = z
  .object({
    kind: definitionKindSchema,
    id: definitionIdSchema,
    /** The file written (save, clone, promote) or removed (delete). Absolute. */
    path: z.string().min(1),
    /** The source that wins the id after the write, or `null` when no definition has the id now. */
    source: definitionSourceSchema.nullable(),
    /** The lower source the winner overrides, or `null`. A local save of a built-in id shadows it. */
    shadows: definitionSourceSchema.nullable(),
    /** Promote only: the repo file is not committed. The owner reviews and commits it like code. */
    uncommitted: z.boolean()
  })
  .strict();
export type DefinitionWriteResult = z.infer<typeof definitionWriteResultSchema>;

// --- actions --------------------------------------------------------------

export const ACTION_NAMES = [
  "start",
  "approve",
  "feedback",
  "continue",
  "cancel",
  "remove",
  "ship",
  "refresh-pr",
  "pr-feedback",
  "draft",
  "apply-draft",
  "pause",
  "resume"
] as const;
export const actionNameSchema = z.enum(ACTION_NAMES);
export type ActionName = z.infer<typeof actionNameSchema>;

export const MAX_FEEDBACK_CHARS = 20_000;

export const actionRequestSchema = z.discriminatedUnion("action", [
  // Without `flowId` the config picks the flow: `flowLabels`, then `defaultFlow`.
  z
    .object({
      action: z.literal("start"),
      override: z.boolean().default(false),
      flowId: definitionIdSchema.optional()
    })
    .strict(),
  // The note answers the plan's open questions. The builder reads it as the owner's words.
  z
    .object({
      action: z.literal("approve"),
      note: z.string().trim().min(1).max(MAX_FEEDBACK_CHARS).optional()
    })
    .strict(),
  // `to` and `from` are step ids of the issue's flow. `actionTargetProblem` checks them against it.
  z
    .object({
      action: z.literal("feedback"),
      to: stageIdSchema,
      text: z.string().trim().min(1).max(MAX_FEEDBACK_CHARS)
    })
    .strict(),
  z.object({ action: z.literal("continue"), from: stageIdSchema.optional() }).strict(),
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
    }),
  // Reads the PR once. It never writes to the PR.
  z.object({ action: z.literal("refresh-pr") }).strict(),
  // Reads the PR and sends its feedback to build. The PR number comes from the issue state.
  z
    .object({
      action: z.literal("pr-feedback"),
      text: z.string().trim().min(1).max(MAX_FEEDBACK_CHARS).optional()
    })
    .strict(),
  z.object({ action: z.literal("draft") }).strict(),
  // Applying replaces the issue body on GitHub. Only an explicit yes reaches the engine.
  z.object({ action: z.literal("apply-draft"), confirm: z.literal(true) }).strict(),
  // Hold the issue after the running stage. It never stops a running agent: `cancel` does.
  z.object({ action: z.literal("pause") }).strict(),
  z.object({ action: z.literal("resume") }).strict()
]);
export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ActionRequestInput = z.input<typeof actionRequestSchema>;

/** Step kinds that take the owner's feedback: the work there runs again with it. */
const FEEDBACK_KINDS: readonly StepKind[] = ["agent", "check"];
/** Step kinds `continue` can restart. A gate is where the owner decides, so nothing restarts there. */
const CONTINUE_KINDS: readonly StepKind[] = ["agent", "check", "ship", "pr-wait"];

/**
 * Why the target of a `feedback` or `continue` request cannot be a target in `flow`, or `null`
 * when it can. It checks the step kind only. Whether the issue may go there now is the engine's
 * decision (`409 invalid-transition`). Pure, so the UI offers the same targets.
 */
export const actionTargetProblem = (
  flow: FlowDefinition,
  request: ActionRequest
): string | null => {
  if (request.action !== "feedback" && request.action !== "continue") return null;
  const target = request.action === "feedback" ? request.to : request.from;
  if (target === undefined) return null;
  // `setup` and `intake` run before the first step. Only `continue` restarts them.
  if (request.action === "continue" && (target === "intake" || target === "setup")) return null;
  const step = isEngineState(target) ? undefined : flow.steps.find((entry) => entry.id === target);
  if (step === undefined) return `'${target}' is not a stage of the flow '${flow.id}'.`;
  if (request.action === "feedback" && !FEEDBACK_KINDS.includes(step.kind)) {
    return `'${target}' is a ${step.kind} step. Feedback goes to an agent or check step.`;
  }
  if (request.action === "continue" && !CONTINUE_KINDS.includes(step.kind)) {
    return `'${target}' is a ${step.kind} step. Continue restarts an agent, check, ship or pr-wait step.`;
  }
  return null;
};

/** How a runner call ended: at a gate, at `needs-you`, or at the end of the issue. */
export const actionOutcomeSchema = z
  .object({
    /** `paused`: the issue holds (or holds once the running stage ends) until `resume`. */
    stop: z.enum(["gate", "needs-you", "shipped", "cancelled", "finished", "removed", "paused"]),
    stage: stageIdSchema.nullable(),
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
    /**
     * The issue's stage when the entry was written: the stage of a history event, or the stage
     * the issue was in. `null` or absent when unknown (entries from before the field existed).
     */
    stage: stageIdSchema.nullable().optional(),
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

/**
 * Repairs the desk runs itself, each a fixed command in the engine. No agent decides what
 * runs, and nothing here needs a login or a secret.
 */
export const HEALTH_FIXES = ["docker-build", "agent-labels", "workspace-builds"] as const;
export const healthFixSchema = z.enum(HEALTH_FIXES);
export type HealthFix = z.infer<typeof healthFixSchema>;

export const healthCheckSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: z.enum(["ok", "warn", "error"]),
    detail: z.string(),
    /** A command the engineer runs in a terminal, such as a login. The page offers it to copy. */
    command: z.string().nullable(),
    /** A repair the desk can run after the engineer confirms it. */
    fix: healthFixSchema.nullable()
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

export const healthFixRequestSchema = z.object({ fix: healthFixSchema }).strict();

/** `202` to a repair request: it runs, and a `health-fix` event reports how it ended. */
export const healthFixAcceptedSchema = z
  .object({ fix: healthFixSchema, status: z.literal("running") })
  .strict();

/** How a repair ended. `detail` is engine text: the last lines of the command, or the reason. */
export const healthFixResultSchema = z
  .object({ fix: healthFixSchema, ok: z.boolean(), detail: z.string() })
  .strict();
export type HealthFixResult = z.infer<typeof healthFixResultSchema>;

// --- GitHub lists ---------------------------------------------------------

/** An open issue of the repository. Its body stays on the server; the page gets the contract count. */
export const githubIssueSchema = z
  .object({
    number: z.number().int().positive(),
    /** Untrusted text from GitHub. The page shows it as plain text. */
    title: z.string(),
    url: z.string(),
    labels: z.array(z.string()),
    /** It carries `ready-for-agent`. Intake still checks who applied it. */
    ready: z.boolean(),
    contract: z
      .object({ found: z.number().int().nonnegative(), total: z.number().int().positive() })
      .strict(),
    /** The desk already has state for it. */
    onBoard: z.boolean(),
    /** The flow `start` picks for it without a `flowId`: from `flowLabels`, else `defaultFlow`. */
    flowId: definitionIdSchema,
    updatedAt: z.string()
  })
  .strict();
export type GithubIssue = z.infer<typeof githubIssueSchema>;

/** An open pull request. The desk shows it and does not work on it. */
export const githubPullSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    url: z.string(),
    draft: z.boolean(),
    branch: z.string(),
    author: z.string().nullable(),
    updatedAt: z.string(),
    /** The desk issue it belongs to: the desk shipped it, or its branch is `KAINE-<n>-...`. */
    issue: z.number().int().positive().nullable()
  })
  .strict();
export type GithubPull = z.infer<typeof githubPullSchema>;

/** `GET /api/github`. `ok: false` when `gh` could not list them; `reason` is engine text. */
export const githubListsSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      issues: z.array(githubIssueSchema),
      pulls: z.array(githubPullSchema),
      fetchedAt: timestampSchema
    })
    .strict(),
  z.object({ ok: z.literal(false), reason: z.string(), fetchedAt: timestampSchema }).strict()
]);
export type GithubLists = z.infer<typeof githubListsSchema>;

// --- server events (SSE) --------------------------------------------------

export const SERVER_EVENT_TYPES = [
  "issue-updated",
  "issue-removed",
  "action-result",
  "log",
  "health",
  "health-fix"
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
  z.object({ type: z.literal("health"), report: healthReportSchema }).strict(),
  z.object({ type: z.literal("health-fix"), result: healthFixResultSchema }).strict()
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;

// --- session --------------------------------------------------------------

/** `POST /api/session`. The one-use launch token comes from the URL fragment. */
export const sessionRequestSchema = z.object({ token: z.string().min(1) }).strict();
export type SessionRequest = z.infer<typeof sessionRequestSchema>;

/** The header every non-GET request needs. A page on another origin cannot set it without a preflight. */
export const DESK_REQUEST_HEADER = "x-desk-request";
export const DESK_REQUEST_HEADER_VALUE = "1";
