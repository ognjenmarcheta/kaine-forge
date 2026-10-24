import { appendFile, mkdir, rename, rm, rmdir } from "node:fs/promises";
import path from "node:path";

import {
  agentOf,
  fitConfidence,
  flowForLabels,
  issueDraftSchema,
  positionKind,
  stepOf,
  stepRoleOf,
  type AgentOutputKind,
  type FlowSnapshot,
  type Isolation,
  type HistoryEvent,
  type IssueState,
  type StageId
} from "../contracts";
import { ISSUE_DRAFT_FILE, draftIssueFormat } from "./intake.draft";
import { INTAKE_FIT_FILE, bodyHash, runIntake } from "./intake.run";
import { ARTIFACTS, readArtifactJson, readPlan, writeArtifactJson } from "./pipeline.artifacts";
import { renameBranchForPlan } from "./pipeline.branch";
import { transition, type NeedsYouReason, type Trigger } from "./pipeline.machine";
import { recoverIssue, stopLeftoverProcess, type RecoveryDeps } from "./pipeline.recovery";
import { createScheduler } from "./pipeline.scheduler";
import { buildStage } from "./pipeline.stage.build";
import { checkStage } from "./pipeline.stage.check";
import { planStage } from "./pipeline.stage.plan";
import { reportStage } from "./pipeline.stage.report";
import { reviewArtifactSchema, reviewStage } from "./pipeline.stage.review";
import { setupStage } from "./pipeline.stage.setup";
import {
  isGate,
  isTerminalStage,
  machineOf,
  needsYouReason,
  statusAfterMove
} from "./pipeline.state";
import type {
  AgentStepHandler,
  ApproveOptions,
  NotifyKind,
  PipelineDeps,
  PipelineEvent,
  PipelineResult,
  ApplyDraftOptions,
  DraftActionResult,
  DraftOptions,
  PrFeedbackOptions,
  Refusal,
  ShipActionResult,
  ShipDryRunResult,
  ShipOptions,
  StageContext,
  StageHandler,
  StageOutcome,
  StatePatch,
  StatusEntry
} from "./pipeline.types";
import { formatContract, parseContract } from "../github/github.contract";
import { checkControllerIdentity } from "../github/github.identity";
import {
  applyLabelChange,
  bestEffort,
  labelForState,
  planLabelChange
} from "../github/github.labels";
import {
  boundPrFeedback,
  renderPrFeedback,
  selectPrFeedback,
  type PullRequestFeedbackRaw
} from "../github/github.pr-feedback";
import type { PullRequestView } from "../github/github.pull-request";
import {
  SnapshotFileError,
  createSnapshotGitHubPort,
  readSnapshotFile
} from "../github/github.snapshot-file";
import { renderStatusComment } from "../github/github.status-comment";
import { TRUSTED_ASSOCIATIONS, type IssueSnapshot } from "../github/github.types";
import { containerCleanupFor, isolationOf, selectIsolation } from "../isolation/isolation.select";
import { resolveFlowSnapshot } from "../registry/registry.snapshot";
import { shipAdmission, type ShipIntent } from "../ship/ship.admission";
import { SHIP_RECORD_FILE } from "../ship/ship.contract";
import {
  describeGateFailures,
  describeShipEvent,
  describeShipFailure
} from "../ship/ship.describe";
import { prepareShip, runShip, type ShipDeps, type ShipTicket } from "../ship/ship.run";
import { acquireLease } from "../store/store.lease";
import { removeWorktree } from "../worktree";

export interface StartOptions {
  /** Skip the `ready-for-agent` label-actor check. Allowed for the owner's own run. */
  readonly override: boolean;
  /**
   * Read the issue from this `IssueSnapshot` JSON file instead of `gh`. For
   * development and end-to-end tests. Needs `override`, and it turns off
   * GitHub write-back for the issue.
   */
  readonly snapshotFile?: string | undefined;
  /**
   * Where this issue's builder and checks run. Recorded in the state, so later calls use it.
   * Without it the config default applies.
   */
  readonly isolation?: Isolation | undefined;
  /**
   * The flow a new issue runs on. Without it: the flow of the first issue label in the config's
   * `flowLabels`, else `defaultFlow`. A restarted intake keeps the flow it has.
   */
  readonly flowId?: string | undefined;
}

export interface RemoveOptions {
  /** Remove the worktree even if it holds uncommitted work. */
  readonly force?: boolean | undefined;
  /** Delete the desk state only. The worktree directory stays on disk. */
  readonly keepWorktree?: boolean | undefined;
}

type Refused = Extract<PipelineResult, { readonly outcome: "refused" }>;

export type RemoveResult =
  | {
      readonly outcome: "removed";
      /** False when the issue had no worktree on disk. */
      readonly worktreeRemoved: boolean;
      /** The branch stays in the repository. */
      readonly branch: string | null;
    }
  | Refused;

export interface PipelineRunner {
  /** Run intake, then drive the issue to its next gate or stop. Repeat it to retry intake after `needs-you`. */
  readonly start: (issue: number, options: StartOptions) => Promise<PipelineResult>;
  /** Drive from the current stage until a gate, `needs-you`, or the end. */
  readonly advance: (issue: number) => Promise<PipelineResult>;
  /**
   * Approve the plan at `plan-gate`, apply the branch rename, then drive. The note, when given,
   * goes to the builder as the owner's answer to the plan's open questions.
   */
  readonly approvePlan: (issue: number, options?: ApproveOptions) => Promise<PipelineResult>;
  /**
   * Send engineer feedback to a step: from a gate, one of its `sendBack` steps; from
   * `needs-you`, any agent step. Then drive.
   */
  readonly feedback: (issue: number, target: StageId, text: string) => Promise<PipelineResult>;
  /** Retry the recorded stage (or `stage`) from `needs-you`, then drive. Never automatic. */
  readonly continueFrom: (issue: number, stage?: StageId) => Promise<PipelineResult>;
  /**
   * Ship from `pr-review`: commit, push, open a draft PR. It needs `confirm`.
   * A dry run writes the ship plan and the PR body and changes no state.
   * A refusal changes nothing. A failure after the first change goes to
   * `needs-you` at `ship`; `continueFrom` retries it. The desk never merges.
   */
  readonly ship: (issue: number, options: ShipOptions) => Promise<ShipActionResult>;
  /**
   * At `pr-open`: read the draft PR on GitHub once. Merged ends the issue at `shipped`,
   * closed ends it at `cancelled`, open changes nothing. Only the owner runs it: the desk
   * never polls, and it never merges, approves, or marks the PR ready.
   */
  readonly refreshPr: (issue: number) => Promise<PipelineResult>;
  /**
   * At `pr-open`: collect the failing checks and the trusted reviews and comments on the PR
   * head, add the owner's own text, and send it all to `build`. Then drive to `pr-review`.
   * It refuses, and changes nothing, unless the PR is open, its head is the clean worktree
   * HEAD, and there is something to send. At the round limit it stops at `needs-you` and
   * reads nothing.
   */
  readonly feedbackFromPr: (issue: number, options?: PrFeedbackOptions) => Promise<PipelineResult>;
  /**
   * For an issue that stopped at intake: the read-only intake agent drafts the issue in the
   * format of `docs/agents/issue-format.md`, into `issue-draft.json`. The issue stays at
   * `needs-you`, and nothing is written to GitHub.
   */
  readonly draft: (issue: number, options?: DraftOptions) => Promise<DraftActionResult>;
  /**
   * Replace the issue body on GitHub with the intake draft. It needs `confirm`, the owner
   * signed in, write-back on, and a body on GitHub that is still the one the draft started
   * from. A refusal changes nothing. The issue stays at `needs-you`: start it again.
   */
  readonly applyDraft: (issue: number, options: ApplyDraftOptions) => Promise<PipelineResult>;
  /**
   * Hold the issue. A running stage ends as usual; then the engine starts no next stage, and
   * an action that would drive the issue stops before its first stage. It never stops an agent.
   * When this process drives the issue, it takes effect at once, without waiting for the lease.
   */
  readonly pause: (issue: number) => Promise<PipelineResult>;
  /** Clear the hold and drive on from where the issue stopped. Refused when it is not paused. */
  readonly resume: (issue: number) => Promise<PipelineResult>;
  /** Stop the running agent (if this process drives the issue) and end the issue. The worktree stays. */
  readonly cancel: (issue: number) => Promise<PipelineResult>;
  /** Delete the issue's desk state and its worktree (unless `keepWorktree`). The branch stays. */
  readonly remove: (issue: number, options?: RemoveOptions) => Promise<RemoveResult>;
  /** One issue, or all issues. Read-only. */
  readonly status: (issue?: number) => Promise<StatusEntry[]>;
}

/** The handler of an agent step, by what its agent produces. An intake agent runs in no flow. */
const AGENT_HANDLERS: Readonly<Partial<Record<AgentOutputKind, AgentStepHandler>>> = {
  plan: planStage,
  change: buildStage,
  review: reviewStage,
  report: reportStage
};

/**
 * The handler for a stage the engine drives with no owner input: `setup`, an agent step,
 * or a check step. `null` for every other stage. Ship has its own executor (`ship/`).
 */
const handlerFor = (snapshot: FlowSnapshot, stage: StageId): StageHandler | null => {
  if (stage === "setup") return setupStage;
  const step = stepOf(snapshot, stage);
  if (step?.kind === "check") return (context) => checkStage(context, step);
  if (step?.kind !== "agent") return null;
  const agent = agentOf(snapshot, step.agent);
  const handler = agent === undefined ? undefined : AGENT_HANDLERS[agent.output];
  return agent === undefined || handler === undefined
    ? null
    : (context) => handler(context, step, agent);
};

/** The flow's ship step opens the PR without the owner's confirmation. */
const shipsAutomatically = (snapshot: FlowSnapshot): boolean =>
  snapshot.flow.steps.some((step) => step.kind === "ship" && step.auto);

const message = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

/** Apply `trigger` to the state through the pure machine, on the issue's own flow snapshot. */
const machine = (state: IssueState, trigger: Trigger) =>
  transition(machineOf(state), trigger, state.flowSnapshot);

interface Session {
  state: IssueState;
  readonly controller: AbortController;
}

const refused = (refusal: Refusal, reason: string, state: IssueState | null = null): Refused => ({
  outcome: "refused",
  refusal,
  reason,
  state
});

export const createPipelineRunner = (deps: PipelineDeps): PipelineRunner => {
  const { store, clock, config, github } = deps;
  const scheduler = deps.scheduler ?? createScheduler(config.maxConcurrentAgents);
  const controllers = new Map<number, AbortController>();
  /** The session each action of this process works on. `pause` changes it in place. */
  const live = new Map<number, Session>();
  const knownLabels = new Map<number, readonly string[]>();
  /** Issues read from a snapshot file: nothing of theirs goes to GitHub. */
  const noWriteback = new Set<number>();
  const recoveryDeps: RecoveryDeps = {
    clock,
    lease: deps.lease,
    log: (text) => emit({ type: "log", issue: 0, message: text }),
    cleanupIsolation: containerCleanupFor(deps)
  };

  const emit = (event: PipelineEvent): void => {
    try {
      deps.onEvent?.(event);
    } catch {
      // A broken listener must not break the pipeline.
    }
  };
  const log = (issue: number, text: string): void => emit({ type: "log", issue, message: text });
  const stamp = (): string => clock.now().toISOString();

  // --- state helpers ------------------------------------------------------

  const record = async (
    session: Session,
    stage: StageId,
    event: string,
    note?: string
  ): Promise<void> => {
    const entry: HistoryEvent = {
      at: stamp(),
      stage,
      event,
      ...(note === undefined ? {} : { note })
    };
    session.state = {
      ...session.state,
      history: [...session.state.history, entry],
      updatedAt: entry.at
    };
    await store.appendEvent(session.state.issueNumber, entry);
    emit({ type: "history", issue: session.state.issueNumber, event: entry });
  };

  const save = async (session: Session): Promise<void> => {
    await store.write(session.state);
    emit({ type: "state", issue: session.state.issueNumber, state: session.state });
  };

  const merge = (session: Session, patch: StatePatch | undefined): void => {
    if (patch !== undefined) session.state = { ...session.state, ...patch, updatedAt: stamp() };
  };

  // --- GitHub write-back and notifications --------------------------------

  const labelsOf = async (issue: number): Promise<readonly string[]> => {
    const known = knownLabels.get(issue);
    if (known !== undefined) return known;
    try {
      const labels = (await github.fetchIssue(issue)).labels;
      knownLabels.set(issue, labels);
      return labels;
    } catch (error) {
      log(issue, `write-back: cannot read labels (${message(error)})`);
      return [];
    }
  };

  /** Best effort: a failed label or comment write is logged and never reaches the stage. */
  const writeBack = async (session: Session): Promise<void> => {
    const { state } = session;
    const issue = state.issueNumber;
    if (deps.noWriteback === true || noWriteback.has(issue)) return;
    try {
      const current = await labelsOf(issue);
      const change = planLabelChange(current, labelForState(state));
      const result = await applyLabelChange(github, issue, change, (text) => log(issue, text));
      if (result.ok) {
        knownLabels.set(issue, [
          ...current.filter((label) => !change.remove.some((removed) => removed === label)),
          ...change.add
        ]);
      }
      await bestEffort(
        "status comment",
        () =>
          github.upsertStatusComment(
            issue,
            renderStatusComment({ state, needsYouReason: needsYouReason(state) })
          ),
        (text) => log(issue, text)
      );
    } catch (error) {
      log(issue, `write-back skipped: ${message(error)}`);
    }
  };

  const notify = (state: IssueState, kind: NotifyKind, text: string): void => {
    try {
      deps.notify?.({ issue: state.issueNumber, stage: state.stage, kind, message: text });
    } catch {
      // A broken notifier must not break the pipeline.
    }
  };

  // --- what the engineer sees at a stop -----------------------------------

  const gateMessage = async (state: IssueState): Promise<string | null> => {
    const dir = store.artifactsDir(state.issueNumber);
    const snapshot = state.flowSnapshot;
    const role = stepRoleOf(snapshot, state.stage);
    if (role === "plan-gate") {
      const plan = await readPlan(dir);
      if (plan.status !== "ok") return null;
      return [
        `Plan ready: ${plan.value.summary}`,
        ...(plan.value.revision === null ? [] : [`Revision: ${plan.value.revision}`]),
        plan.value.openQuestions.length === 0
          ? "No open questions."
          : `Open questions:\n${plan.value.openQuestions.map((question) => `- ${question}`).join("\n")}`
      ].join("\n");
    }
    if (role === "ship-gate") {
      const review = await readArtifactJson(dir, ARTIFACTS.review, reviewArtifactSchema);
      if (review.status !== "ok") return null;
      return `Review approved with ${review.value.review.findings.length} finding(s). ${review.value.review.plainLanguage}`;
    }
    if (positionKind(snapshot, state.stage) === "pr-wait" && state.prUrl) {
      return `Draft PR: ${state.prUrl}`;
    }
    return null;
  };

  const stopped = async (state: IssueState): Promise<PipelineResult> => {
    if (state.stage === "shipped")
      return { outcome: "stopped", stop: "shipped", state, message: null };
    if (state.stage === "cancelled") {
      return { outcome: "stopped", stop: "cancelled", state, message: null };
    }
    if (state.stage === "finished") {
      return { outcome: "stopped", stop: "finished", state, message: null };
    }
    if (state.stage === "needs-you") {
      return { outcome: "stopped", stop: "needs-you", state, message: needsYouReason(state) };
    }
    return { outcome: "stopped", stop: "gate", state, message: await gateMessage(state) };
  };

  const describeStop = (
    snapshot: FlowSnapshot,
    reason: NeedsYouReason | null,
    from: StageId,
    outcome: StageOutcome | null
  ): string => {
    if (outcome?.kind === "needs-you") return outcome.reason;
    const step = stepOf(snapshot, from);
    if (reason === "pr-round-limit" && step?.kind === "pr-wait") {
      return `PR feedback went back to ${step.backTo} ${step.maxRounds} round(s). Finish the PR by hand, or continue.`;
    }
    const back = step?.loopBack?.to;
    if (reason === "same-failure") {
      return `The same check failure came back after a fix attempt. Read check-report.json in the artifacts folder, then give feedback to ${back ?? "the step before"} or continue.`;
    }
    if (reason === "loop-limit" && step?.loopBack !== undefined) {
      const { limit, to } = step.loopBack;
      return step.kind === "check"
        ? `The checks still fail after ${limit} fix round(s). Read check-report.json in the artifacts folder, then give feedback to ${to} or continue.`
        : `The reviewer still asks for changes after ${limit} round(s). Read review.json in the artifacts folder, then give feedback to ${to} or continue.`;
    }
    return `Stopped in '${from}'.`;
  };

  // --- transitions --------------------------------------------------------

  /**
   * Apply a trigger through the pure machine. Returns the machine's rejection,
   * or `null` after it moved the session. The caller records events.
   */
  const move = (
    session: Session,
    trigger: Trigger,
    patch?: StatePatch
  ):
    | { readonly ok: false; readonly reason: string }
    | { readonly ok: true; readonly reasonCode: NeedsYouReason | null; readonly from: StageId } => {
    const from = session.state.stage;
    const result = machine(session.state, trigger);
    if (!result.ok) return { ok: false, reason: result.reason };
    session.state = {
      ...session.state,
      ...patch,
      ...result.state,
      status: statusAfterMove(session.state.flowSnapshot, result.nextStage),
      updatedAt: stamp()
    };
    return { ok: true, reasonCode: result.reason, from };
  };

  const finishMove = async (session: Session, reason: string | null): Promise<void> => {
    // The machine enters `finished` once, from the last step of a flow without a ship step.
    if (session.state.stage === "finished") {
      await record(session, "finished", "flow-finished", "every step done; nothing shipped");
    }
    const { state } = session;
    await save(session);
    await writeBack(session);
    if (state.stage === "needs-you") notify(state, "needs-you", reason ?? "The issue needs you.");
    else if (isGate(state.flowSnapshot, state.stage))
      notify(state, "gate", (await gateMessage(state)) ?? "Waiting for you.");
    else if (state.stage === "shipped") {
      notify(state, "done", state.prUrl ? `PR merged: ${state.prUrl}` : "Done.");
    } else if (state.stage === "finished") {
      notify(state, "done", "Every step ran. Nothing was shipped.");
    }
  };

  /** Turn a stage handler's outcome into one machine transition. */
  const applyOutcome = async (
    session: Session,
    stage: StageId,
    outcome: Exclude<StageOutcome, { kind: "aborted" }>
  ): Promise<void> => {
    const trigger: Trigger =
      outcome.kind === "complete"
        ? { type: "step-complete", step: stage, outcome: "ok" }
        : outcome.kind === "trigger"
          ? outcome.trigger
          : { type: "error" };
    let moved = move(session, trigger, outcome.patch);
    let forced: string | null = null;
    if (!moved.ok) {
      // A handler asked for an edge the machine does not have: an engine bug. Never lose the run.
      forced = `Internal error: the pipeline machine rejected '${trigger.type}' in '${stage}' (${moved.reason}).`;
      moved = move(session, { type: "error" }, outcome.patch);
      if (!moved.ok) throw new Error(forced);
    }

    if (outcome.kind !== "needs-you" && forced === null) {
      await record(session, stage, outcome.event, outcome.note);
    }
    let reason: string | null = null;
    if (session.state.stage === "needs-you") {
      reason =
        forced ?? describeStop(session.state.flowSnapshot, moved.reasonCode, moved.from, outcome);
      if (outcome.kind === "trigger" && forced === null && outcome.note !== undefined) {
        reason = `${reason} (${outcome.note})`;
      }
      await record(session, "needs-you", "needs-you", reason);
    }
    await finishMove(session, reason);
  };

  // --- the drive loop -----------------------------------------------------

  const contextFor = (session: Session): StageContext => ({
    deps,
    issue: session.state.issueNumber,
    state: () => session.state,
    artifactsDir: store.artifactsDir(session.state.issueNumber),
    signal: session.controller.signal,
    scheduler,
    log: (text) => log(session.state.issueNumber, text),
    record: (stage, event, note) => record(session, stage, event, note),
    patch: async (patch) => {
      merge(session, patch);
      await save(session);
    },
    emitAgent: (role, event) =>
      emit({ type: "agent", issue: session.state.issueNumber, role, event })
  });

  const runStage = async (
    session: Session,
    stage: StageId,
    handler: StageHandler
  ): Promise<void> => {
    session.state = { ...session.state, status: "running", updatedAt: stamp() };
    await record(session, stage, "stage-started");
    await save(session);

    let outcome: StageOutcome;
    try {
      outcome = await handler(contextFor(session));
    } catch (error) {
      outcome = { kind: "needs-you", reason: `'${stage}' failed unexpectedly: ${message(error)}` };
    }
    // A cancelled run makes no transition. The cancel action ends the issue.
    if (outcome.kind === "aborted" || session.controller.signal.aborted) return;
    await applyOutcome(session, stage, outcome);
  };

  const drive = async (session: Session): Promise<PipelineResult> => {
    live.set(session.state.issueNumber, session);
    for (;;) {
      const { stage, flowSnapshot: snapshot } = session.state;
      if (session.controller.signal.aborted) return stopped(session.state);
      if (stage === "needs-you" || isGate(snapshot, stage) || isTerminalStage(stage)) {
        if (session.state.status === "running" || session.state.status === "queued") {
          session.state = { ...session.state, status: statusAfterMove(snapshot, stage) };
          await save(session);
        }
        return stopped(session.state);
      }
      // The hold: the stage before has ended, and this one does not start until `resume`.
      if (session.state.pauseRequested === true) {
        if (session.state.status !== "waiting") {
          session.state = { ...session.state, status: "waiting", updatedAt: stamp() };
          await record(session, stage, "paused", `before '${stage}'`);
          await save(session);
          await writeBack(session);
        }
        return {
          outcome: "stopped",
          stop: "paused",
          state: session.state,
          message: `Paused before '${stage}'. Resume to run it.`
        };
      }
      if (positionKind(snapshot, stage) === "ship") {
        // An automatic ship, or a retry after `continue` of a ship the engineer confirmed before.
        await executeShip(session, {
          dryRun: false,
          intent: shipsAutomatically(snapshot) ? "automatic" : "retry"
        });
        continue;
      }
      const handler = handlerFor(snapshot, stage);
      if (handler === null) {
        return stage === "intake"
          ? refused(
              "intake-refused",
              `Intake runs through 'start'. Run 'start' again for #${session.state.issueNumber}.`,
              session.state
            )
          : refused(
              "invalid-transition",
              `'${stage}' is not a step the engine can run in the flow '${snapshot.flow.id}'.`,
              session.state
            );
      }
      await runStage(session, stage, handler);
    }
  };

  // --- actions ------------------------------------------------------------

  /**
   * Run `body` for `issue`: queued behind earlier actions of the same issue,
   * and under the issue's lease, so another desk process cannot drive it too.
   * `body` gets the session (`null` when the issue has no state yet) and the
   * controller that `cancel` aborts.
   */
  const withLease = <R>(
    issue: number,
    body: (session: Session | null, controller: AbortController) => Promise<R>,
    options: { readonly needsState: boolean }
  ): Promise<R | Refused> =>
    scheduler.serial(issue, async (): Promise<R | Refused> => {
      if (options.needsState) {
        // Check before the lease: acquiring one creates the issue directory.
        const peek = await store.read(issue);
        if (peek.status === "missing") {
          return refused("unknown-issue", `#${issue} has no desk state. Run 'start' first.`);
        }
      }
      const leased = await acquireLease(store.leasePath(issue), deps.lease);
      if (leased.status === "held") {
        const holder = leased.holder === null ? "" : ` (pid ${leased.holder.pid})`;
        return refused(
          "leased",
          `Another desk process drives #${issue}${holder}. Wait for it or stop it.`
        );
      }
      const controller = new AbortController();
      controllers.set(issue, controller);
      try {
        const read = await store.read(issue);
        if (read.status === "unreadable" && options.needsState) {
          return refused(
            "unreadable",
            `State for #${issue} is unreadable (${read.reason}): ${read.detail}`
          );
        }
        const session: Session | null =
          read.status === "ok" ? { state: read.state, controller } : null;
        if (session !== null) live.set(issue, session);
        return await body(session, controller);
      } finally {
        controllers.delete(issue);
        live.delete(issue);
        await leased.lease.release();
        // A refused `start` leaves the directory that the lease created. Drop it while it is empty.
        if (!options.needsState) await rmdir(store.issueDir(issue)).catch(() => undefined);
      }
    });

  const requireSession = (session: Session | null): Session => {
    if (session === null) throw new Error("Internal error: the action needs an issue state.");
    return session;
  };

  const start: PipelineRunner["start"] = (issue, options) =>
    withLease(
      issue,
      async (_existing, controller) => {
        const mode = options.isolation ?? config.isolation;
        if (mode === "docker") {
          if (deps.docker === undefined) {
            return refused(
              "intake-refused",
              "Docker isolation is not wired into this desk process."
            );
          }
          const problem = await deps.docker.preflight();
          if (problem !== null) return refused("intake-refused", problem);
        }
        let source = github;
        if (options.snapshotFile !== undefined) {
          if (!options.override) {
            return refused(
              "authorization",
              "A snapshot file is not a trusted source. Start with --override to use it."
            );
          }
          try {
            const snapshot = await readSnapshotFile(options.snapshotFile);
            if (snapshot.number !== issue) {
              return refused(
                "intake-refused",
                `The snapshot file is for #${snapshot.number}, not #${issue}.`
              );
            }
            source = createSnapshotGitHubPort(snapshot, config.owner ?? "desk-local-owner");
          } catch (error) {
            if (error instanceof SnapshotFileError) return refused("intake-refused", error.message);
            throw error;
          }
          noWriteback.add(issue);
        }

        // A new issue runs on the flow of this checkout, frozen now. A restarted intake keeps its own.
        let flowSnapshot: FlowSnapshot | null = null;
        if ((await store.read(issue)).status === "missing") {
          let flowId = options.flowId;
          if (flowId === undefined && Object.keys(config.flowLabels).length > 0) {
            try {
              flowId = flowForLabels(config, (await source.fetchIssue(issue)).labels);
            } catch (error) {
              return refused(
                "intake-refused",
                `Cannot read the labels of #${issue} to pick its flow: ${message(error)}`
              );
            }
          }
          // What the checkout has not installed is no refusal: each run drops it and records why.
          const resolved = await resolveFlowSnapshot({
            repoRoot: deps.location.repoRoot,
            config,
            flowId
          });
          if (!resolved.ok) return refused("intake-refused", resolved.reason);
          flowSnapshot = resolved.snapshot;
        }

        const result = await runIntake(
          { github: source, store, clock, config, log: (text) => log(issue, text) },
          { issueNumber: issue, override: options.override, writeBack: false, flowSnapshot }
        );
        if (result.outcome === "refused") return refused("intake-refused", result.reason);
        if (result.outcome === "skipped") {
          return refused("already-started", result.reason, result.state);
        }

        const session: Session = {
          state:
            options.isolation === undefined
              ? result.state
              : { ...result.state, isolation: options.isolation },
          controller
        };
        if (result.outcome === "needs-you") {
          const reason = result.reason;
          await save(session);
          await finishMove(session, reason);
          return stopped(session.state);
        }
        // Intake parked the issue at setup. From here the engine drives it.
        session.state = { ...session.state, status: "queued", updatedAt: stamp() };
        await save(session);
        await writeBack(session);
        return drive(session);
      },
      { needsState: false }
    );

  const advance: PipelineRunner["advance"] = (issue) =>
    withLease(
      issue,
      async (loaded) => {
        const session = requireSession(loaded);
        // We hold the lease, so a `running` or `queued` state is a leftover of a dead driver.
        if (session.state.status === "running" || session.state.status === "queued") {
          const recovered = await recoverIssue(store, session.state, recoveryDeps);
          session.state = recovered.state;
          await writeBack(session);
        }
        return drive(session);
      },
      { needsState: true }
    );

  /**
   * Apply an engineer's trigger and then drive. `before` runs after the machine
   * accepted the trigger and before the state changes (branch rename).
   */
  const humanAction = (
    issue: number,
    trigger: Trigger,
    options: {
      readonly event: string;
      /** A function is read after `prepare`, so it can use what `prepare` found. */
      readonly note?: string | (() => string | undefined);
      readonly patch?: StatePatch | (() => StatePatch | undefined);
      readonly prepare?: (session: Session) => Promise<PipelineResult | null>;
      /** The event name, when `prepare` decides it. */
      readonly eventFor?: () => string;
      readonly after?: (session: Session) => Promise<void>;
    }
  ): Promise<PipelineResult> =>
    withLease(
      issue,
      async (loaded) => {
        const session = requireSession(loaded);
        const check = machine(session.state, trigger);
        if (!check.ok) return refused("invalid-transition", check.reason, session.state);
        const early = await options.prepare?.(session);
        if (early) return early;

        const from = session.state.stage;
        const patch = typeof options.patch === "function" ? options.patch() : options.patch;
        const note = typeof options.note === "function" ? options.note() : options.note;
        const moved = move(session, trigger, patch);
        if (!moved.ok) return refused("invalid-transition", moved.reason, session.state);
        await record(session, from, options.eventFor?.() ?? options.event, note);
        await options.after?.(session);
        let reason: string | null = null;
        if (session.state.stage === "needs-you") {
          reason = describeStop(session.state.flowSnapshot, moved.reasonCode, from, null);
          await record(session, "needs-you", "needs-you", reason);
        }
        await finishMove(session, reason);
        return drive(session);
      },
      { needsState: true }
    );

  /** A gate approval. At the gate after the plan it approves the plan and keeps the note. */
  const approvePlan: PipelineRunner["approvePlan"] = (issue, options = {}) => {
    let planGate = true;
    return humanAction(
      issue,
      { type: "gate-approve" },
      {
        event: "plan-approved",
        ...(options.note?.trim() ? { note: "with a note" } : {}),
        // A new approval replaces the note of an earlier one.
        patch: () => (planGate ? { approveNote: options.note?.trim() || null } : undefined),
        prepare: async (session) => {
          planGate = stepRoleOf(session.state.flowSnapshot, session.state.stage) === "plan-gate";
          if (!planGate) {
            if (options.note?.trim()) {
              return refused(
                "invalid-transition",
                "A note goes with the plan approval only. Give feedback to send words to a step.",
                session.state
              );
            }
            return null;
          }
          const plan = await readPlan(store.artifactsDir(issue));
          if (plan.status !== "ok") {
            return refused(
              "invalid-transition",
              `The plan cannot be read (${plan.status === "missing" ? "plan.json is missing" : plan.detail}). Give feedback to plan.`,
              session.state
            );
          }
          const gate = session.state.stage;
          const rename = await renameBranchForPlan(deps.git, session.state, plan.value);
          if (rename.status === "renamed") {
            session.state = { ...session.state, branch: rename.to, updatedAt: stamp() };
            await record(session, gate, "branch-renamed", `${rename.from} -> ${rename.to}`);
          } else if (rename.status === "skipped") {
            await record(session, gate, "branch-rename-skipped", rename.reason);
          }
          return null;
        },
        eventFor: () => (planGate ? "plan-approved" : "gate-approved")
      }
    );
  };

  const feedback: PipelineRunner["feedback"] = (issue, target, text) =>
    humanAction(
      issue,
      { type: "feedback", target },
      {
        event: "feedback",
        note: `to ${target}`,
        patch: { pendingFeedback: { target, source: "human", text: text.trim() || "(no text)" } },
        prepare: async (session) => {
          if (text.trim() === "") {
            return refused("invalid-transition", "Feedback needs text.", session.state);
          }
          const dir = store.artifactsDir(issue);
          await mkdir(dir, { recursive: true });
          await appendFile(
            path.join(dir, ARTIFACTS.feedback),
            `\n## ${stamp()} to ${target}\n\n${text.trim()}\n`,
            "utf8"
          );
          return null;
        }
      }
    );

  const feedbackFromPr: PipelineRunner["feedbackFromPr"] = (issue, options = {}) => {
    const ownerText = options.text?.trim() ?? "";
    let collected: {
      readonly text: string;
      readonly note: string;
      readonly head: string;
      readonly target: StageId;
    } | null = null;
    return humanAction(
      issue,
      { type: "pr-feedback" },
      {
        event: "pr-feedback",
        note: () => collected?.note,
        patch: () =>
          collected === null
            ? undefined
            : {
                pendingFeedback: { target: collected.target, source: "pr", text: collected.text },
                prHeadSha: collected.head,
                shipConfirmed: false
              },
        prepare: async (session) => {
          // At the round limit the machine stops the issue. Nothing is read from GitHub.
          const limit = machine(session.state, { type: "pr-feedback" });
          if (!limit.ok || limit.nextStage === "needs-you") return null;
          const target = limit.nextStage;

          const refuse = (reason: string): PipelineResult =>
            refused("pr-refused", `${reason} Nothing was changed.`, session.state);
          if (deps.noWriteback === true || noWriteback.has(issue)) {
            return refuse(
              `#${issue} reads nothing from GitHub (no write-back or a snapshot file).`
            );
          }
          const prNumber = session.state.prNumber ?? null;
          if (prNumber === null) return refuse(`#${issue} has no pull request number.`);
          const worktree = session.state.worktreePath;
          if (worktree === null) return refuse(`#${issue} has no worktree.`);

          let pr: PullRequestView;
          try {
            pr = await github.viewPullRequest(prNumber);
          } catch (error) {
            return refuse(`GitHub read failed: ${message(error)}.`);
          }
          if (pr.state !== "OPEN") {
            return refuse(`PR #${prNumber} is ${pr.state.toLowerCase()}. Run refresh.`);
          }
          // The builder works on the worktree. Feedback on another head is about other code.
          const head = await deps.git.headSha(worktree);
          if (pr.headRefOid !== head) {
            return refuse(
              `The head of PR #${prNumber} (${pr.headRefOid.slice(0, 12)}) is not the worktree HEAD (${head.slice(0, 12)}). Someone else pushed to the branch.`
            );
          }
          if ((await deps.git.statusPorcelain(worktree)).trim() !== "") {
            return refuse("The worktree has uncommitted changes.");
          }

          let raw: PullRequestFeedbackRaw;
          try {
            raw = await github.fetchPullRequestFeedback(prNumber, head);
          } catch (error) {
            return refuse(`GitHub read failed: ${message(error)}.`);
          }
          const since =
            [...session.state.history]
              .reverse()
              .find((entry) => entry.event === "pr-opened" || entry.event === "pr-updated")?.at ??
            null;
          const selected = selectPrFeedback(raw, {
            headSha: head,
            since,
            trusted: TRUSTED_ASSOCIATIONS,
            trustedBots: config.reviewBots
          });
          const items = selected.comments.length + selected.failingChecks.length;
          const skippedNote =
            selected.skipped.length === 0
              ? ""
              : `; left out for trust: ${selected.skipped.join(", ")} (a review bot can be listed in reviewBots)`;
          if (items === 0 && ownerText === "") {
            return refuse(
              `PR #${prNumber} has no failing check and no trusted comment on ${head.slice(0, 12)}, and you wrote no text${skippedNote}.`
            );
          }

          const text = [
            ...(ownerText === "" ? [] : [`### The owner's note\n\n${ownerText}`]),
            ...(items === 0
              ? []
              : [
                  `### From PR #${prNumber} at ${head.slice(0, 12)}\n\n${renderPrFeedback(selected)}`
                ])
          ].join("\n\n");
          const dir = store.artifactsDir(issue);
          await mkdir(dir, { recursive: true });
          await writeArtifactJson(dir, ARTIFACTS.prFeedback, {
            version: 1,
            prNumber,
            headSha: head,
            since,
            collectedAt: stamp(),
            ...boundPrFeedback(selected)
          });
          await appendFile(
            path.join(dir, ARTIFACTS.feedback),
            `\n## ${stamp()} to ${target} from PR #${prNumber}\n\n${text}\n`,
            "utf8"
          );
          // The ship of this round starts clean. The record of the last ship stays readable.
          const round = session.state.prRounds ?? 0;
          await rename(
            path.join(dir, SHIP_RECORD_FILE),
            path.join(dir, `ship-record.round-${round}.json`)
          ).catch((error: unknown) => {
            if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
              throw error;
            }
          });
          collected = {
            text,
            head,
            target,
            note: `round ${round + 1}: ${selected.comments.length} comment(s), ${selected.failingChecks.length} failing check(s)${ownerText === "" ? "" : ", owner note"}${skippedNote}`
          };
          return null;
        }
      }
    );
  };

  const continueFrom: PipelineRunner["continueFrom"] = (issue, stage) =>
    withLease(
      issue,
      async (loaded) => {
        const session = requireSession(loaded);
        const snapshot = session.state.flowSnapshot;
        const target = stage ?? session.state.resumeStage;
        const targetKind = target === null ? null : positionKind(snapshot, target);
        if (session.state.stage === "needs-you" && target === "intake") {
          return refused(
            "invalid-transition",
            `Intake needs its options. Run 'start' again for #${issue}.`,
            session.state
          );
        }
        if (targetKind === "ship") {
          const admission = shipAdmission(session.state, "retry", { writeback: writesBack(issue) });
          if (!admission.ok) return refused(admission.refusal, admission.reason, session.state);
        }
        if (targetKind === "pr-wait" && (session.state.prNumber ?? null) === null) {
          return refused(
            "invalid-transition",
            `#${issue} has no pull request to wait for. Continue from another stage.`,
            session.state
          );
        }
        const trigger: Trigger = {
          type: "continue",
          ...(stage === undefined ? {} : { from: stage })
        };
        const check = machine(session.state, trigger);
        if (!check.ok) return refused("invalid-transition", check.reason, session.state);

        const moved = move(session, trigger);
        if (!moved.ok) return refused("invalid-transition", moved.reason, session.state);
        await record(session, "needs-you", "continued", `retry '${session.state.stage}'`);
        await finishMove(session, null);
        return drive(session);
      },
      { needsState: true }
    );

  // --- ship ---------------------------------------------------------------

  type ShipExecution =
    | { readonly kind: "dry-run"; readonly result: Pick<ShipDryRunResult, "plan" | "files"> }
    | {
        readonly kind: "refused";
        readonly refusal: "invalid-transition" | "ship-refused";
        readonly reason: string;
      }
    | { readonly kind: "settled" };

  const writesBack = (issue: number): boolean =>
    deps.noWriteback !== true && !noWriteback.has(issue);

  /**
   * The one place an issue enters its ship stage, for an admitted ship and before its first
   * change. A confirmed ship moves from its gate; an automatic one says that no owner confirmed.
   */
  const enterShip = async (session: Session, ticket: ShipTicket, shipStage: string) => {
    if (session.state.stage !== shipStage) {
      const gate = session.state.stage;
      const moved = move(session, { type: "ship-confirm" }, { shipConfirmed: true });
      if (!moved.ok) throw new Error(`Internal error: ${moved.reason}`);
      await record(session, gate, "ship-confirmed");
    } else if (ticket.intent === "automatic") {
      await record(session, shipStage, "ship-automatic", "no owner confirmation; a draft PR only");
    }
    session.state = { ...session.state, status: "running", updatedAt: stamp() };
    await record(session, shipStage, "stage-started");
    await save(session);
    await writeBack(session);
  };

  /**
   * Ship for a session: the ship module admits it and evaluates the gate, then this applies
   * the outcome. A ship refused at its gate changes nothing; one refused in the ship step (an
   * automatic ship or a retry) stops at `needs-you`. Success moves the issue to `pr-open`; any
   * failure after the first change ends it at `needs-you` with `resumeStage: "ship"`.
   */
  const executeShip = async (
    session: Session,
    mode: { readonly dryRun: boolean; readonly intent: ShipIntent }
  ): Promise<ShipExecution> => {
    const issue = session.state.issueNumber;
    const shipping = session.state.flowSnapshot.flow.steps.find((step) => step.kind === "ship");
    if (shipping === undefined) throw new Error("Internal error: the flow has no ship step.");
    const shipStage = shipping.id;

    // The ship checks run where the loop checks ran. Never on the host for a Docker issue.
    const isolation = selectIsolation(deps, session.state);
    const shipDeps: ShipDeps = {
      exec: deps.exec,
      git: deps.git,
      github,
      clock,
      config,
      store,
      onEvent: (event) => log(issue, describeShipEvent(event)),
      checkSlot: (task) => scheduler.check.run(task),
      runChecks: (request) =>
        isolation.ok
          ? isolation.port.runChecks({ ...request, issue })
          : Promise.reject(new Error(isolation.reason))
    };
    const prepared = await prepareShip(shipDeps, {
      state: session.state,
      intent: mode.intent,
      writeback: writesBack(issue),
      dryRun: mode.dryRun
    });

    const notShipped = async (
      refusal: "invalid-transition" | "ship-refused",
      reason: string
    ): Promise<ShipExecution> => {
      if (session.state.stage !== shipStage) return { kind: "refused", refusal, reason };
      await applyOutcome(session, shipStage, { kind: "needs-you", reason });
      return { kind: "settled" };
    };
    switch (prepared.status) {
      case "dry-run":
        return { kind: "dry-run", result: prepared };
      case "not-admitted":
        return notShipped(prepared.refusal, prepared.reason);
      case "refused":
        return notShipped(
          "ship-refused",
          `The ship gate refused. Nothing was changed.\n${describeGateFailures(prepared.failures)}`
        );
      case "failed":
        return notShipped("ship-refused", describeShipFailure(prepared.failure));
      case "admitted":
        break;
    }

    await enterShip(session, prepared.ticket, shipStage);
    const result = await runShip(prepared.ticket);
    switch (result.status) {
      case "dry-run":
        throw new Error("Internal error: an admitted ship came back as a dry run.");
      case "refused":
        // The gate failed after the first change (after the checks or the rebase).
        await applyOutcome(session, shipStage, {
          kind: "needs-you",
          reason: `The ship gate refused:\n${describeGateFailures(result.failures)}`
        });
        return { kind: "settled" };
      case "failed": {
        const progress = result.failure.progress;
        await applyOutcome(session, shipStage, {
          kind: "needs-you",
          reason: describeShipFailure(result.failure),
          ...(progress === null
            ? {}
            : { patch: { baseSha: progress.baseSha, commitSha: progress.commitSha } })
        });
        return { kind: "settled" };
      }
      case "shipped":
        await applyOutcome(session, shipStage, {
          kind: "complete",
          event: result.updated ? "pr-updated" : "pr-opened",
          note: result.prUrl,
          patch: {
            prUrl: result.prUrl,
            prNumber: result.prNumber,
            commitSha: result.commitSha,
            prHeadSha: result.commitSha,
            baseSha: result.baseSha
          }
        });
        return { kind: "settled" };
    }
  };

  const ship: PipelineRunner["ship"] = (issue, options) =>
    withLease(
      issue,
      async (loaded): Promise<ShipActionResult> => {
        const session = requireSession(loaded);
        const execution = await executeShip(session, {
          dryRun: options.dryRun === true,
          intent: "confirmed"
        });
        if (execution.kind === "refused") {
          return refused(execution.refusal, execution.reason, session.state);
        }
        if (execution.kind === "dry-run") {
          const { plan, files } = execution.result;
          return { outcome: "dry-run", state: session.state, plan, files };
        }
        return stopped(session.state);
      },
      { needsState: true }
    );

  const refreshPr: PipelineRunner["refreshPr"] = (issue) =>
    withLease(
      issue,
      async (loaded): Promise<PipelineResult> => {
        const session = requireSession(loaded);
        const check = machine(session.state, { type: "pr-closed", merged: true });
        if (!check.ok) return refused("invalid-transition", check.reason, session.state);
        const refuse = (reason: string): PipelineResult =>
          refused("refresh-refused", `${reason} Nothing was changed.`, session.state);
        if (deps.noWriteback === true || noWriteback.has(issue)) {
          return refuse(`#${issue} reads nothing from GitHub (no write-back or a snapshot file).`);
        }
        const prNumber = session.state.prNumber ?? null;
        if (prNumber === null) return refuse(`#${issue} has no pull request number.`);

        let pr: PullRequestView;
        try {
          pr = await github.viewPullRequest(prNumber);
        } catch (error) {
          return refuse(`GitHub read failed: ${message(error)}.`);
        }
        if (pr.state === "OPEN") {
          return {
            outcome: "stopped",
            stop: "gate",
            state: session.state,
            message: `PR #${prNumber} is still open: ${pr.url}`
          };
        }
        const merged = pr.state === "MERGED";
        const waiting = session.state.stage;
        const moved = move(session, { type: "pr-closed", merged });
        if (!moved.ok) return refused("invalid-transition", moved.reason, session.state);
        await record(session, waiting, merged ? "pr-merged" : "pr-closed", pr.url);
        await finishMove(session, null);
        return stopped(session.state);
      },
      { needsState: true }
    );

  const draft: PipelineRunner["draft"] = (issue, options = {}) =>
    withLease(
      issue,
      async (loaded): Promise<DraftActionResult> => {
        const session = requireSession(loaded);
        if (session.state.stage !== "needs-you" || session.state.resumeStage !== "intake") {
          return refused(
            "invalid-transition",
            `#${issue} did not stop at intake. Only such an issue gets a draft of the issue format.`,
            session.state
          );
        }
        let source = github;
        if (options.snapshotFile !== undefined) {
          try {
            const snapshot = await readSnapshotFile(options.snapshotFile);
            if (snapshot.number !== issue) {
              return refused(
                "intake-refused",
                `The snapshot file is for #${snapshot.number}, not #${issue}.`,
                session.state
              );
            }
            source = createSnapshotGitHubPort(snapshot, config.owner ?? "desk-local-owner");
          } catch (error) {
            if (error instanceof SnapshotFileError) {
              return refused("intake-refused", error.message, session.state);
            }
            throw error;
          }
        }
        let owner: string;
        let snapshot: IssueSnapshot;
        try {
          const identity = await checkControllerIdentity(source, config.owner);
          if (!identity.ok) return refused("authorization", identity.reason, session.state);
          owner = identity.owner;
          snapshot = await source.fetchIssue(issue);
        } catch (error) {
          return refused("intake-refused", `GitHub read failed: ${message(error)}`, session.state);
        }
        if (!snapshot.open) {
          return refused("intake-refused", `Issue #${issue} is closed.`, session.state);
        }

        // A new draft replaces the old one, also when it fails: no stale draft stays to apply.
        await rm(path.join(store.artifactsDir(issue), ISSUE_DRAFT_FILE), { force: true });
        await rm(path.join(store.artifactsDir(issue), INTAKE_FIT_FILE), { force: true });
        await record(session, "needs-you", "draft-started");
        await save(session);
        const result = await draftIssueFormat(contextFor(session), { snapshot, owner });
        if (!result.ok) {
          if (result.aborted) return stopped(session.state);
          await record(session, "needs-you", "draft-failed", result.reason);
          await save(session);
          return {
            outcome: "stopped",
            stop: "needs-you",
            state: session.state,
            message: result.reason
          };
        }
        const { draft: drafted } = result;
        await record(
          session,
          "needs-you",
          "draft-ready",
          `contract ${drafted.contract.found}/${drafted.contract.total}; ${drafted.recommendation}${drafted.fit === undefined ? "" : `; fit confidence ${fitConfidence(drafted.fit)}`}`
        );
        await save(session);
        return { outcome: "drafted", state: session.state, draft: drafted };
      },
      { needsState: true }
    );

  const applyDraft: PipelineRunner["applyDraft"] = (issue, options) =>
    withLease(
      issue,
      async (loaded): Promise<PipelineResult> => {
        const session = requireSession(loaded);
        const refuse = (reason: string): PipelineResult =>
          refused("draft-refused", `${reason} Nothing was changed.`, session.state);
        if (session.state.stage !== "needs-you" || session.state.resumeStage !== "intake") {
          return refuse(`#${issue} did not stop at intake.`);
        }
        const artifacts = store.artifactsDir(issue);
        const stored = await readArtifactJson(artifacts, ISSUE_DRAFT_FILE, issueDraftSchema);
        if (stored.status !== "ok" || stored.value.issue !== issue) {
          return refuse(`#${issue} has no draft. Run 'draft' first.`);
        }
        const drafted = stored.value;
        // The engine checks the body again: a local file is no reason to trust a write.
        const report = parseContract(drafted.body);
        if (report.missing.length > 0 || report.acceptanceCriteria.length === 0) {
          return refuse(`The draft does not read as a full contract (${formatContract(report)}).`);
        }
        if (!options.confirm) {
          return refuse("Replacing the issue body needs your explicit confirmation.");
        }
        if (deps.noWriteback === true || noWriteback.has(issue)) {
          return refuse(
            `#${issue} writes nothing to GitHub (no write-back or a snapshot file). Copy the draft by hand.`
          );
        }
        try {
          const identity = await checkControllerIdentity(github, config.owner);
          if (!identity.ok) return refused("authorization", identity.reason, session.state);
          const current = await github.fetchIssue(issue);
          if (!current.open) return refuse(`Issue #${issue} is closed.`);
          if (bodyHash(current.body) !== drafted.originalBodyHash) {
            return refuse(`The issue changed on GitHub after the draft. Run 'draft' again.`);
          }
          await github.editIssueBody(issue, drafted.body);
        } catch (error) {
          return refuse(`GitHub failed: ${message(error)}.`);
        }
        await rm(path.join(artifacts, ISSUE_DRAFT_FILE), { force: true });
        await record(session, "needs-you", "draft-applied", formatContract(report));
        await save(session);
        return {
          outcome: "stopped",
          stop: "needs-you",
          state: session.state,
          message: `The body of #${issue} on GitHub is the draft now. Run 'start' again.`
        };
      },
      { needsState: true }
    );

  const cancel: PipelineRunner["cancel"] = (issue) => {
    // Stop the agent now. The cancel action then waits for the running action to end.
    controllers.get(issue)?.abort();
    return withLease(
      issue,
      async (loaded) => {
        const session = requireSession(loaded);
        const check = machine(session.state, { type: "cancel" });
        if (!check.ok) return refused("invalid-transition", check.reason, session.state);

        const leftover = await stopLeftoverProcess(session.state, recoveryDeps);
        const from = session.state.stage;
        const moved = move(
          session,
          { type: "cancel" },
          { activeProcess: null, pauseRequested: false, pausedAt: null }
        );
        if (!moved.ok) return refused("invalid-transition", moved.reason, session.state);
        await record(session, from, "cancelled", leftover ?? undefined);
        await finishMove(session, null);
        return stopped(session.state);
      },
      { needsState: true }
    );
  };

  // --- pause ---------------------------------------------------------------

  const requestPause = async (session: Session): Promise<PipelineResult> => {
    const { stage } = session.state;
    if (isTerminalStage(stage)) {
      return refused(
        "invalid-transition",
        `#${session.state.issueNumber} has ended at '${stage}'. There is nothing to pause.`,
        session.state
      );
    }
    if (session.state.pauseRequested !== true) {
      const at = stamp();
      session.state = { ...session.state, pauseRequested: true, pausedAt: at, updatedAt: at };
      await record(session, stage, "pause-requested");
      await save(session);
    }
    const running = session.state.status === "running" || session.state.status === "queued";
    return {
      outcome: "stopped",
      stop: "paused",
      state: session.state,
      message: running
        ? `Pauses once '${stage}' ends.`
        : "Paused. The engine starts no stage until you resume."
    };
  };

  const pause: PipelineRunner["pause"] = (issue) => {
    // An action of this process drives the issue: change its session now. The drive loop reads
    // the flag before the next stage. Waiting for the lease would wait for the whole drive.
    const running = live.get(issue);
    if (running !== undefined) return requestPause(running);
    return withLease(issue, (loaded) => requestPause(requireSession(loaded)), {
      needsState: true
    });
  };

  const resume: PipelineRunner["resume"] = (issue) =>
    withLease(
      issue,
      async (loaded) => {
        const session = requireSession(loaded);
        if (session.state.pauseRequested !== true) {
          return refused("invalid-transition", `#${issue} is not paused.`, session.state);
        }
        const { stage } = session.state;
        const held = !(
          stage === "needs-you" ||
          isGate(session.state.flowSnapshot, stage) ||
          isTerminalStage(stage)
        );
        session.state = {
          ...session.state,
          pauseRequested: false,
          pausedAt: null,
          // A held stage is next to run again.
          ...(held ? { status: "queued" } : {}),
          updatedAt: stamp()
        };
        await record(session, stage, "resumed");
        await save(session);
        await writeBack(session);
        return drive(session);
      },
      { needsState: true }
    );

  const remove: PipelineRunner["remove"] = async (issue, options = {}) => {
    controllers.get(issue)?.abort();
    const force = options.force === true;
    return withLease<RemoveResult>(
      issue,
      async (session) => {
        let worktreeRemoved = false;
        if (session === null) {
          const read = await store.read(issue);
          if (read.status === "unreadable" && !force) {
            return refused(
              "unreadable",
              `State for #${issue} is unreadable (${read.reason}): ${read.detail}. Use force to delete it.`
            );
          }
        } else {
          await stopLeftoverProcess(session.state, recoveryDeps);
          if (deps.docker !== undefined && isolationOf(config, session.state) === "docker") {
            try {
              const note = await deps.docker.removeIssue(issue);
              if (note !== null) log(issue, note);
            } catch (error) {
              if (!force) {
                return refused(
                  "remove-failed",
                  `The Docker resources of #${issue} could not be removed and verified: ${message(error)}. Fix Docker and run remove again, or use force and clean up with 'pnpm desk docker prune --issue ${issue}'.`,
                  session.state
                );
              }
              log(
                issue,
                `Docker cleanup failed (force): ${message(error)}. Run 'pnpm desk docker prune --issue ${issue}'.`
              );
            }
          }
          const worktreePath = session.state.worktreePath;
          if (worktreePath !== null && options.keepWorktree !== true) {
            const removed = await removeWorktree(
              { git: deps.git },
              { repoDir: deps.location.repoRoot, worktreePath, force }
            );
            if (!removed.ok) {
              return removed.reason === "dirty"
                ? refused(
                    "worktree-dirty",
                    `The worktree has uncommitted work. Use force to discard it:\n${removed.detail}`,
                    session.state
                  )
                : refused("remove-failed", removed.detail, session.state);
            }
            worktreeRemoved = removed.removed;
          }
          if (deps.noWriteback !== true && !noWriteback.has(issue)) {
            const current = await labelsOf(issue);
            await applyLabelChange(github, issue, planLabelChange(current, null), (text) =>
              log(issue, text)
            );
          }
        }
        await rm(store.issueDir(issue), { recursive: true, force: true });
        knownLabels.delete(issue);
        noWriteback.delete(issue);
        return { outcome: "removed", worktreeRemoved, branch: session?.state.branch ?? null };
      },
      { needsState: false }
    );
  };

  const status: PipelineRunner["status"] = async (issue) => {
    const entry = (issueNumber: number, result: StatusEntry["result"]): StatusEntry => ({
      issueNumber,
      result,
      needsYouReason: result.status === "ok" ? needsYouReason(result.state) : null
    });
    if (issue !== undefined) return [entry(issue, await store.read(issue))];
    return (await store.list()).map(({ issueNumber, result }) => entry(issueNumber, result));
  };

  return {
    start,
    advance,
    approvePlan,
    feedback,
    continueFrom,
    ship,
    refreshPr,
    feedbackFromPr,
    draft,
    applyDraft,
    pause,
    resume,
    cancel,
    remove,
    status
  };
};
