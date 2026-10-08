import { appendFile, mkdir, rm, rmdir } from "node:fs/promises";
import path from "node:path";

import {
  type ActiveStage,
  type Isolation,
  type FeedbackTarget,
  type HistoryEvent,
  type IssueState,
  type LoopLimits,
  type Stage
} from "../contracts";
import { runIntake } from "./intake.run";
import { ARTIFACTS, readArtifactJson, readPlan } from "./pipeline.artifacts";
import { renameBranchForPlan } from "./pipeline.branch";
import { transition, type NeedsYouReason, type Trigger } from "./pipeline.machine";
import { recoverIssue, stopLeftoverProcess, type RecoveryDeps } from "./pipeline.recovery";
import { createScheduler } from "./pipeline.scheduler";
import { buildStage } from "./pipeline.stage.build";
import { checkStage } from "./pipeline.stage.check";
import { planStage } from "./pipeline.stage.plan";
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
  HandledStage,
  NotifyKind,
  PipelineDeps,
  PipelineEvent,
  PipelineResult,
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
import {
  applyLabelChange,
  bestEffort,
  labelForState,
  planLabelChange
} from "../github/github.labels";
import {
  SnapshotFileError,
  createSnapshotGitHubPort,
  readSnapshotFile
} from "../github/github.snapshot-file";
import { renderStatusComment } from "../github/github.status-comment";
import { containerCleanupFor, isolationOf } from "../isolation/isolation.select";
import {
  describeGateFailures,
  describeShipEvent,
  describeShipFailure
} from "../ship/ship.describe";
import type { ShipGateFailure } from "../ship/ship.gate";
import { shipIssue, type ShipDeps } from "../ship/ship.run";
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
  /** Approve the plan at `plan-gate`, apply the branch rename, then drive. */
  readonly approvePlan: (issue: number) => Promise<PipelineResult>;
  /** Send engineer feedback to `plan`, `build` or `review`, then drive. */
  readonly feedback: (
    issue: number,
    target: FeedbackTarget,
    text: string
  ) => Promise<PipelineResult>;
  /** Retry the recorded stage (or `stage`) from `needs-you`, then drive. Never automatic. */
  readonly continueFrom: (issue: number, stage?: Stage) => Promise<PipelineResult>;
  /**
   * Ship from `pr-review`: commit, push, open a draft PR. It needs `confirm`.
   * A dry run writes the ship plan and the PR body and changes no state.
   * A refusal changes nothing. A failure after the first change goes to
   * `needs-you` at `ship`; `continueFrom` retries it. The desk never merges.
   */
  readonly ship: (issue: number, options: ShipOptions) => Promise<ShipActionResult>;
  /** Stop the running agent (if this process drives the issue) and end the issue. The worktree stays. */
  readonly cancel: (issue: number) => Promise<PipelineResult>;
  /** Delete the issue's desk state and its worktree (unless `keepWorktree`). The branch stays. */
  readonly remove: (issue: number, options?: RemoveOptions) => Promise<RemoveResult>;
  /** One issue, or all issues. Read-only. */
  readonly status: (issue?: number) => Promise<StatusEntry[]>;
}

const HANDLERS: Readonly<Record<HandledStage, StageHandler>> = {
  setup: setupStage,
  plan: planStage,
  build: buildStage,
  check: checkStage,
  review: reviewStage
};

const message = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

const isHandled = (stage: Stage): stage is HandledStage => Object.keys(HANDLERS).includes(stage);

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
  const limits: LoopLimits = { check: config.maxTestLoops, review: config.maxReviewLoops };
  const controllers = new Map<number, AbortController>();
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
    stage: Stage,
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
            renderStatusComment({ state, needsYouReason: needsYouReason(state), limits })
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
    if (state.stage === "plan-gate") {
      const plan = await readPlan(dir);
      if (plan.status !== "ok") return null;
      return [
        `Plan ready: ${plan.value.summary}`,
        plan.value.openQuestions.length === 0
          ? "No open questions."
          : `Open questions:\n${plan.value.openQuestions.map((question) => `- ${question}`).join("\n")}`
      ].join("\n");
    }
    if (state.stage === "pr-review") {
      const review = await readArtifactJson(dir, ARTIFACTS.review, reviewArtifactSchema);
      if (review.status !== "ok") return null;
      return `Review approved with ${review.value.review.findings.length} finding(s). ${review.value.review.plainLanguage}`;
    }
    return null;
  };

  const stopped = async (state: IssueState): Promise<PipelineResult> => {
    if (state.stage === "shipped")
      return { outcome: "stopped", stop: "shipped", state, message: null };
    if (state.stage === "cancelled") {
      return { outcome: "stopped", stop: "cancelled", state, message: null };
    }
    if (state.stage === "needs-you") {
      return { outcome: "stopped", stop: "needs-you", state, message: needsYouReason(state) };
    }
    return { outcome: "stopped", stop: "gate", state, message: await gateMessage(state) };
  };

  const describeStop = (
    reason: NeedsYouReason | null,
    from: Stage,
    outcome: StageOutcome
  ): string => {
    if (outcome.kind === "needs-you") return outcome.reason;
    if (reason === "same-failure") {
      return "The same check failure came back after a fix attempt. Read check-report.json in the artifacts folder, then give feedback to build or continue.";
    }
    if (reason === "loop-limit") {
      return from === "check"
        ? `The checks still fail after ${limits.check} fix round(s). Read check-report.json in the artifacts folder, then give feedback to build or continue.`
        : `The reviewer still asks for changes after ${limits.review} round(s). Read review.json in the artifacts folder, then give feedback to build or continue.`;
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
    | { readonly ok: true; readonly reasonCode: NeedsYouReason | null; readonly from: Stage } => {
    const from = session.state.stage;
    const result = transition(machineOf(session.state), trigger, limits);
    if (!result.ok) return { ok: false, reason: result.reason };
    session.state = {
      ...session.state,
      ...patch,
      ...result.state,
      status: statusAfterMove(result.nextStage),
      updatedAt: stamp()
    };
    return { ok: true, reasonCode: result.reason, from };
  };

  const finishMove = async (session: Session, reason: string | null): Promise<void> => {
    const { state } = session;
    await save(session);
    await writeBack(session);
    if (state.stage === "needs-you") notify(state, "needs-you", reason ?? "The issue needs you.");
    else if (isGate(state.stage))
      notify(state, "gate", (await gateMessage(state)) ?? "Waiting for you.");
    else if (state.stage === "shipped") {
      notify(state, "done", state.prUrl ? `Draft PR: ${state.prUrl}` : "Done.");
    }
  };

  /** Turn a stage handler's outcome into one machine transition. */
  const applyOutcome = async (
    session: Session,
    stage: ActiveStage,
    outcome: Exclude<StageOutcome, { kind: "aborted" }>
  ): Promise<void> => {
    const trigger: Trigger =
      outcome.kind === "complete"
        ? { type: "stage-complete", stage, outcome: "ok" }
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
      reason = forced ?? describeStop(moved.reasonCode, moved.from, outcome);
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

  const runStage = async (session: Session, stage: HandledStage): Promise<void> => {
    session.state = { ...session.state, status: "running", updatedAt: stamp() };
    await record(session, stage, "stage-started");
    await save(session);

    let outcome: StageOutcome;
    try {
      outcome = await HANDLERS[stage](contextFor(session));
    } catch (error) {
      outcome = { kind: "needs-you", reason: `'${stage}' failed unexpectedly: ${message(error)}` };
    }
    // A cancelled run makes no transition. The cancel action ends the issue.
    if (outcome.kind === "aborted" || session.controller.signal.aborted) return;
    await applyOutcome(session, stage, outcome);
  };

  const drive = async (session: Session): Promise<PipelineResult> => {
    for (;;) {
      const { stage } = session.state;
      if (session.controller.signal.aborted) return stopped(session.state);
      if (stage === "needs-you" || isGate(stage) || isTerminalStage(stage)) {
        if (session.state.status === "running" || session.state.status === "queued") {
          session.state = { ...session.state, status: statusAfterMove(stage) };
          await save(session);
        }
        return stopped(session.state);
      }
      if (stage === "ship") {
        // A retry after `continue`: the engineer confirmed this ship before.
        await executeShip(session, { dryRun: false, retry: true });
        continue;
      }
      if (!isHandled(stage)) {
        return refused(
          "intake-refused",
          `Intake runs through 'start'. Run 'start' again for #${session.state.issueNumber}.`,
          session.state
        );
      }
      await runStage(session, stage);
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
        return await body(
          read.status === "ok" ? { state: read.state, controller } : null,
          controller
        );
      } finally {
        controllers.delete(issue);
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

        const result = await runIntake(
          { github: source, store, clock, config, log: (text) => log(issue, text) },
          { issueNumber: issue, override: options.override, writeBack: false },
          limits
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
      readonly note?: string;
      readonly patch?: StatePatch;
      readonly prepare?: (session: Session) => Promise<PipelineResult | null>;
      readonly after?: (session: Session) => Promise<void>;
    }
  ): Promise<PipelineResult> =>
    withLease(
      issue,
      async (loaded) => {
        const session = requireSession(loaded);
        const check = transition(machineOf(session.state), trigger, limits);
        if (!check.ok) return refused("invalid-transition", check.reason, session.state);
        const early = await options.prepare?.(session);
        if (early) return early;

        const from = session.state.stage;
        const moved = move(session, trigger, options.patch);
        if (!moved.ok) return refused("invalid-transition", moved.reason, session.state);
        await record(session, from, options.event, options.note);
        await options.after?.(session);
        await finishMove(session, null);
        return drive(session);
      },
      { needsState: true }
    );

  const approvePlan: PipelineRunner["approvePlan"] = (issue) =>
    humanAction(
      issue,
      { type: "approve-plan" },
      {
        event: "plan-approved",
        prepare: async (session) => {
          const plan = await readPlan(store.artifactsDir(issue));
          if (plan.status !== "ok") {
            return refused(
              "invalid-transition",
              `The plan cannot be read (${plan.status === "missing" ? "plan.json is missing" : plan.detail}). Give feedback to plan.`,
              session.state
            );
          }
          const rename = await renameBranchForPlan(deps.git, session.state, plan.value);
          if (rename.status === "renamed") {
            session.state = { ...session.state, branch: rename.to, updatedAt: stamp() };
            await record(session, "plan-gate", "branch-renamed", `${rename.from} -> ${rename.to}`);
          } else if (rename.status === "skipped") {
            await record(session, "plan-gate", "branch-rename-skipped", rename.reason);
          }
          return null;
        }
      }
    );

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

  const continueFrom: PipelineRunner["continueFrom"] = (issue, stage) =>
    withLease(
      issue,
      async (loaded) => {
        const session = requireSession(loaded);
        const target = stage ?? session.state.resumeStage;
        if (session.state.stage === "needs-you" && target === "intake") {
          return refused(
            "invalid-transition",
            `Intake needs its options. Run 'start' again for #${issue}.`,
            session.state
          );
        }
        if (
          target === "ship" &&
          (session.state.resumeStage !== "ship" || session.state.shipConfirmed !== true)
        ) {
          // Only a ship that the engineer confirmed and that then failed is retried.
          return refused(
            "ship-refused",
            `A ship starts only from 'pr-review', with your confirmation: pnpm desk ship ${issue} --confirm. Nothing was changed.`,
            session.state
          );
        }
        const trigger: Trigger = {
          type: "continue",
          ...(stage === undefined ? {} : { from: stage })
        };
        const check = transition(machineOf(session.state), trigger, limits);
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
    | { readonly kind: "refused"; readonly failures: readonly ShipGateFailure[] }
    | { readonly kind: "settled" };

  /**
   * Run the ship executor for a session. A real run enters the `ship` stage
   * only after the gate passed, so a refusal changes nothing. A retry starts
   * inside `ship`. Success ends the issue at `shipped`; any failure after
   * the first change ends it at `needs-you` with `resumeStage: "ship"`.
   */
  const executeShip = async (
    session: Session,
    mode: { readonly dryRun: boolean; readonly retry: boolean }
  ): Promise<ShipExecution> => {
    const issue = session.state.issueNumber;
    let began = false;
    const begin = async (): Promise<void> => {
      if (began) return;
      began = true;
      if (session.state.stage === "pr-review") {
        const moved = move(session, { type: "ship-confirm" }, { shipConfirmed: true });
        if (!moved.ok) throw new Error(`Internal error: ${moved.reason}`);
        await record(session, "pr-review", "ship-confirmed");
      }
      session.state = { ...session.state, status: "running", updatedAt: stamp() };
      await record(session, "ship", "stage-started");
      await save(session);
      await writeBack(session);
    };
    if (mode.retry) await begin();

    const shipDeps: ShipDeps = {
      exec: deps.exec,
      git: deps.git,
      github,
      clock,
      config,
      store,
      onEvent: (event) => log(issue, describeShipEvent(event)),
      checkSlot: (task) => scheduler.check.run(task),
      beforeChange: mode.dryRun ? undefined : begin
    };
    // A dry run asks the gate as if the engineer confirmed, so the plan lists only the real blockers.
    const result = await shipIssue(shipDeps, { issue, confirm: true, dryRun: mode.dryRun });

    switch (result.status) {
      case "dry-run":
        return { kind: "dry-run", result };
      case "refused":
        if (!began) return { kind: "refused", failures: result.failures };
        // The gate failed after the first change (after the checks or the rebase).
        await applyOutcome(session, "ship", {
          kind: "needs-you",
          reason: `The ship gate refused:\n${describeGateFailures(result.failures)}`
        });
        return { kind: "settled" };
      case "failed": {
        await begin();
        const progress = result.failure.progress;
        await applyOutcome(session, "ship", {
          kind: "needs-you",
          reason: describeShipFailure(result.failure),
          ...(progress === null
            ? {}
            : { patch: { baseSha: progress.baseSha, commitSha: progress.commitSha } })
        });
        return { kind: "settled" };
      }
      case "shipped":
        await begin();
        await applyOutcome(session, "ship", {
          kind: "complete",
          event: "shipped",
          note: result.prUrl,
          patch: {
            prUrl: result.prUrl,
            prNumber: result.prNumber,
            commitSha: result.commitSha,
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
        const dryRun = options.dryRun === true;
        const check = transition(machineOf(session.state), { type: "ship-confirm" }, limits);
        if (!check.ok) return refused("invalid-transition", check.reason, session.state);
        if (!dryRun && !options.confirm) {
          return refused(
            "ship-refused",
            "Shipping needs your explicit confirmation. Nothing was changed.",
            session.state
          );
        }
        const execution = await executeShip(session, { dryRun, retry: false });
        if (execution.kind === "refused") {
          return refused(
            "ship-refused",
            `The ship gate refused. Nothing was changed.\n${describeGateFailures(execution.failures)}`,
            session.state
          );
        }
        if (execution.kind === "dry-run") {
          const { plan, files } = execution.result;
          return { outcome: "dry-run", state: session.state, plan, files };
        }
        return stopped(session.state);
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
        const check = transition(machineOf(session.state), { type: "cancel" }, limits);
        if (!check.ok) return refused("invalid-transition", check.reason, session.state);

        const leftover = await stopLeftoverProcess(session.state, recoveryDeps);
        const from = session.state.stage;
        const moved = move(session, { type: "cancel" }, { activeProcess: null });
        if (!moved.ok) return refused("invalid-transition", moved.reason, session.state);
        await record(session, from, "cancelled", leftover ?? undefined);
        await finishMove(session, null);
        return stopped(session.state);
      },
      { needsState: true }
    );
  };

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

  return { start, advance, approvePlan, feedback, continueFrom, ship, cancel, remove, status };
};
