import type { AgentEvent, AgentRunner } from "../agents/agent.runner";
import type { RolePromptDeps } from "../agents/roles";
import type {
  AgentDefinition,
  AgentStageRole,
  DeskConfig,
  FlowStep,
  HistoryEvent,
  IssueDraft,
  IssueState,
  Provider,
  StageId
} from "../contracts";
import type { GitPort } from "../git";
import type { IsolationPort } from "../isolation/isolation.port";
import type { Clock, Exec, GitHubPort } from "../ports";
import type { Trigger } from "./pipeline.machine";
import type { Scheduler } from "./pipeline.scheduler";
import type { ShipPlan } from "../ship/ship.contract";
import type { IssueReadResult, IssueStore } from "../store/store.issue";
import type { LeaseDeps } from "../store/store.lease";
import type { RepoLocation } from "../store/store.root";

/** Live events for a log, a CLI, or a UI. They never carry secrets: output is bounded text. */
export type PipelineEvent =
  | { readonly type: "history"; readonly issue: number; readonly event: HistoryEvent }
  | { readonly type: "state"; readonly issue: number; readonly state: IssueState }
  | {
      readonly type: "agent";
      readonly issue: number;
      readonly role: AgentStageRole;
      readonly event: AgentEvent;
    }
  | { readonly type: "log"; readonly issue: number; readonly message: string };

export const NOTIFY_KINDS = ["gate", "needs-you", "done"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

/** Something the engineer should look at: a gate, a stop, or a finished run. */
export interface PipelineNotification {
  readonly issue: number;
  readonly stage: StageId;
  readonly kind: NotifyKind;
  readonly message: string;
}

export interface PipelineDeps {
  readonly exec: Exec;
  readonly git: GitPort;
  /** Labels, status comment. Reads for intake come from here unless a snapshot file is used. */
  readonly github: GitHubPort;
  readonly runnerFor: (provider: Provider) => AgentRunner;
  /**
   * Docker isolation. Used for an issue whose mode is `docker`. Without it such an issue
   * stops at its first agent or check stage with a clear reason.
   */
  readonly docker?: IsolationPort | undefined;
  readonly store: IssueStore;
  readonly clock: Clock;
  readonly config: DeskConfig;
  readonly location: Pick<RepoLocation, "repoRoot" | "stateRoot">;
  /** Per-issue queue, agent slots and the check slot. Default: `createScheduler(config.maxConcurrentAgents)`. */
  readonly scheduler?: Scheduler | undefined;
  readonly notify?: ((notification: PipelineNotification) => void) | undefined;
  readonly onEvent?: ((event: PipelineEvent) => void) | undefined;
  /** Skip every label and status comment write. */
  readonly noWriteback?: boolean | undefined;
  /** Agent time limits in ms. Defaults: planner 20 min, builder 60 min, reviewer 20 min. */
  readonly agentTimeoutsMs?: Partial<Record<AgentStageRole, number>> | undefined;
  /** Seams for tests. */
  readonly lease?: Partial<LeaseDeps> | undefined;
  readonly prompts?: RolePromptDeps | undefined;
  /** Per setup step id, in ms. Passed to `createWorktree`. */
  readonly setupTimeoutsMs?: Readonly<Record<string, number>> | undefined;
}

export const REFUSALS = [
  /** Another process drives the issue. */
  "leased",
  "unknown-issue",
  "unreadable",
  /** The machine does not allow this action in the current stage. */
  "invalid-transition",
  /** A ship rule refused: no confirmation, a failed gate rule. Nothing was changed. */
  "ship-refused",
  /** Applying an intake draft refused: no confirmation, no draft, a changed issue. */
  "draft-refused",
  /** Reading the PR at `pr-open` refused: no write-back, no PR number, a failed GitHub read. */
  "refresh-refused",
  /**
   * Sending PR feedback refused: no write-back, no PR, a PR that is not open or whose head is
   * not the worktree HEAD, a dirty worktree, a failed GitHub read, or nothing to send.
   */
  "pr-refused",
  /** `start` found state that is past intake. */
  "already-started",
  /** Intake could not run (identity, GitHub, closed state, bad snapshot file). */
  "intake-refused",
  /** The authorization rules do not allow the run. */
  "authorization",
  /** `remove` would lose uncommitted work. */
  "worktree-dirty",
  "remove-failed"
] as const;
export type Refusal = (typeof REFUSALS)[number];

/** `paused`: the owner holds the issue. Nothing more runs until `resume`. */
export type StopKind = "gate" | "needs-you" | "shipped" | "cancelled" | "finished" | "paused";

/**
 * What an API call returns. `stopped`: the call did its work and the issue
 * now waits for a person (`gate`, `needs-you`) or has ended. `refused`: the
 * call changed nothing, and `reason` tells why.
 */
export type PipelineResult =
  | {
      readonly outcome: "stopped";
      readonly stop: StopKind;
      readonly state: IssueState;
      /** Why the issue needs you, or what the gate shows. */
      readonly message: string | null;
    }
  | {
      readonly outcome: "refused";
      readonly refusal: Refusal;
      readonly reason: string;
      readonly state: IssueState | null;
    };

/** What the ship action takes. A real ship needs `confirm`; a dry run changes nothing. */
export interface ShipOptions {
  /** The engineer's explicit yes. A real ship refuses without it. */
  readonly confirm: boolean;
  /** Write the ship plan and the PR body to the artifacts folder. Nothing else changes. */
  readonly dryRun?: boolean | undefined;
}

/** What the plan approval takes. */
export interface ApproveOptions {
  /** The owner's answer to the plan's open questions. The builder reads it. */
  readonly note?: string | undefined;
}

/** What the PR feedback action takes. */
export interface PrFeedbackOptions {
  /** The owner's own words for the builder. Sent as the owner's, outside the untrusted fence. */
  readonly text?: string | undefined;
}

/** A dry run changed no state. It wrote the plan and the PR body. */
export interface ShipDryRunResult {
  readonly outcome: "dry-run";
  readonly state: IssueState;
  readonly plan: ShipPlan;
  /** Absolute paths of the files the dry run wrote. */
  readonly files: {
    readonly plan: string;
    readonly prBody: string;
    readonly commitMessage: string;
  };
}

export type ShipActionResult = PipelineResult | ShipDryRunResult;

/** A draft is ready. The issue stays where it stopped, at `needs-you` after intake. */
export interface DraftedResult {
  readonly outcome: "drafted";
  readonly state: IssueState;
  readonly draft: IssueDraft;
}

/** `drafted`, a refusal, or `stopped` with the reason when the draft run failed. */
export type DraftActionResult = PipelineResult | DraftedResult;

export interface ApplyDraftOptions {
  /** The owner's explicit yes. Without it the apply refuses and changes nothing. */
  readonly confirm: boolean;
}

export interface DraftOptions {
  /** Read the issue from an `IssueSnapshot` file, as `start --snapshot-file` did. */
  readonly snapshotFile?: string | undefined;
}

export interface StatusEntry {
  readonly issueNumber: number;
  readonly result: IssueReadResult;
  /** The reason from the latest `needs-you` event, while the issue is in `needs-you`. */
  readonly needsYouReason: string | null;
}

/** State changes a stage handler may ask for. The runner writes them with the transition. */
export type StatePatch = Partial<
  Pick<
    IssueState,
    | "branch"
    | "worktreePath"
    | "baseSha"
    | "sessions"
    | "pendingFeedback"
    | "authorization"
    | "activeProcess"
    | "shipConfirmed"
    | "commitSha"
    | "prUrl"
    | "prNumber"
    | "prHeadSha"
    | "approveNote"
    | "pauseRequested"
    | "pausedAt"
  >
>;

/** What a stage handler reports. Only the runner applies it, through the pure machine. */
export type StageOutcome =
  | {
      readonly kind: "complete";
      readonly event: string;
      readonly note?: string;
      readonly patch?: StatePatch;
    }
  | {
      /** A stage that picks its edge: check pass or fail, review approve or changes. */
      readonly kind: "trigger";
      readonly trigger: Trigger;
      readonly event: string;
      readonly note?: string;
      readonly patch?: StatePatch;
      /** Shown when the trigger sends the issue to `needs-you` (loop limit, same failure). */
      readonly stopReason?: string;
    }
  | {
      readonly kind: "needs-you";
      readonly reason: string;
      readonly patch?: StatePatch;
    }
  /** The run was cancelled. The runner makes no transition. */
  | { readonly kind: "aborted" };

/** The view of a running issue that a stage handler gets. */
export interface StageContext {
  readonly deps: PipelineDeps;
  readonly issue: number;
  /** The latest state. It changes when the handler calls `patch`. */
  readonly state: () => IssueState;
  readonly artifactsDir: string;
  readonly signal: AbortSignal;
  readonly scheduler: Scheduler;
  readonly log: (message: string) => void;
  readonly record: (stage: StageId, event: string, note?: string) => Promise<void>;
  /** Merge into the state and write it now (a pid, a session). */
  readonly patch: (patch: StatePatch) => Promise<void>;
  readonly emitAgent: (role: AgentStageRole, event: AgentEvent) => void;
}

export type StageHandler = (context: StageContext) => Promise<StageOutcome>;

export type AgentStep = Extract<FlowStep, { readonly kind: "agent" }>;
export type CheckStep = Extract<FlowStep, { readonly kind: "check" }>;

/** Runs one agent step with the step's agent from the issue's flow snapshot. */
export type AgentStepHandler = (
  context: StageContext,
  step: AgentStep,
  agent: AgentDefinition
) => Promise<StageOutcome>;
