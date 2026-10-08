import type { HistoryEvent, IssueState } from "../contracts";
import type { Clock } from "../ports";
import { transition } from "./pipeline.machine";
import { machineOf, statusAfterMove } from "./pipeline.state";
import type { CleanupStatus } from "../process/process.tree";
import { stopProcessGroup } from "../process/process.tree";
import type { IssueStore } from "../store/store.issue";
import {
  acquireLease,
  defaultIsProcessAlive,
  defaultProcessStart,
  type LeaseDeps
} from "../store/store.lease";

/**
 * Restart recovery. A desk process that dies leaves its issue as `running` or
 * `queued`. Recovery turns every such issue into `needs-you`, with the stage
 * to retry and a note. It never resumes anything by itself. If the dead desk
 * left an agent process behind, recovery stops that process group, but only
 * after it checks that the pid still belongs to the recorded process.
 */

export interface RecoveryDeps {
  readonly clock: Clock;
  readonly log?: ((message: string) => void) | undefined;
  /** Seams for tests. Defaults use the real process table. */
  readonly lease?: Partial<LeaseDeps> | undefined;
  readonly isProcessAlive?: ((pid: number) => boolean) | undefined;
  readonly processStart?: ((pid: number) => Promise<string | null>) | undefined;
  readonly stopGroup?: ((pid: number) => Promise<CleanupStatus>) | undefined;
  /**
   * Remove the isolation resources of a stopped run (Docker containers). Returns a note or `null`.
   * It must not throw: recovery has to finish.
   */
  readonly cleanupIsolation?: ((state: IssueState) => Promise<string | null>) | undefined;
}

export type RecoveryAction =
  /** The issue is now in `needs-you`. */
  | "marked-needs-you"
  /** A live desk process holds the lease. Recovery left the issue alone. */
  | "left-running"
  | "unreadable";

export interface RecoveryEntry {
  readonly issueNumber: number;
  readonly action: RecoveryAction;
  /** The stage `continue` retries. */
  readonly stage?: IssueState["stage"];
  /** What recovery did about a leftover agent process. */
  readonly processNote?: string;
}

/**
 * Stop the agent process group a dead (or cancelled) desk left behind. It acts
 * only if the pid still has the recorded start time. Returns a note, or `null`
 * when no process was recorded.
 */
export const stopLeftoverProcess = async (
  state: IssueState,
  deps: RecoveryDeps
): Promise<string | null> => {
  const processNote = await stopRecordedProcess(state, deps);
  const isolationNote = (await deps.cleanupIsolation?.(state)) ?? null;
  const notes = [processNote, isolationNote].filter((note): note is string => note !== null);
  return notes.length === 0 ? null : notes.join(" ");
};

const stopRecordedProcess = async (
  state: IssueState,
  deps: RecoveryDeps
): Promise<string | null> => {
  const active = state.activeProcess;
  if (active === null || active === undefined) return null;
  const alive = (deps.isProcessAlive ?? defaultIsProcessAlive)(active.pid);
  if (!alive) return `The agent process (pid ${active.pid}) was already gone.`;
  const current = await (deps.processStart ?? defaultProcessStart)(active.pid);
  if (active.processStart === null || current === null || current !== active.processStart) {
    return `Pid ${active.pid} is alive, but it may not be the agent process. Recovery left it alone.`;
  }
  const status = await (deps.stopGroup ?? stopProcessGroup)(active.pid);
  return status === "passed"
    ? `Stopped the agent process group left behind (pid ${active.pid}).`
    : `Could not stop the agent process group (pid ${active.pid}). Stop it by hand.`;
};

/**
 * Recover one issue whose lease the caller holds. Writes the new state and
 * one `interrupted` event. Returns the state unchanged when nothing was
 * running.
 */
export const recoverIssue = async (
  store: IssueStore,
  state: IssueState,
  deps: RecoveryDeps
): Promise<{ readonly state: IssueState; readonly processNote: string | null }> => {
  if (state.status !== "running" && state.status !== "queued") {
    return { state, processNote: null };
  }
  const at = deps.clock.now().toISOString();
  const processNote = await stopLeftoverProcess(state, deps);

  const moved = transition(machineOf(state), { type: "error" });
  if (!moved.ok) {
    // A gate, `needs-you` or a terminal stage never runs work: only the status is wrong.
    const settled: IssueState = {
      ...state,
      status: statusAfterMove(state.stage),
      activeProcess: null,
      updatedAt: at
    };
    await store.write(settled);
    return { state: settled, processNote };
  }

  const note = [
    `Interrupted: the desk stopped while '${state.stage}' was ${state.status}.`,
    processNote,
    `Continue to retry '${state.stage}'.`
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
  const event: HistoryEvent = { at, stage: "needs-you", event: "interrupted", note };
  const recovered: IssueState = {
    ...state,
    ...moved.state,
    status: "waiting",
    activeProcess: null,
    history: [...state.history, event],
    updatedAt: at
  };
  await store.write(recovered);
  await store.appendEvent(state.issueNumber, event);
  deps.log?.(`#${state.issueNumber}: ${note}`);
  return { state: recovered, processNote };
};

/** Recover every interrupted issue in the store. A live driver's issue is skipped. */
export const recoverInterrupted = async (
  store: IssueStore,
  deps: RecoveryDeps
): Promise<RecoveryEntry[]> => {
  const entries: RecoveryEntry[] = [];
  for (const { issueNumber, result } of await store.list()) {
    if (result.status === "unreadable") {
      entries.push({ issueNumber, action: "unreadable" });
      continue;
    }
    if (result.status !== "ok") continue;
    if (result.state.status !== "running" && result.state.status !== "queued") continue;

    const leased = await acquireLease(store.leasePath(issueNumber), deps.lease);
    if (leased.status === "held") {
      entries.push({ issueNumber, action: "left-running", stage: result.state.stage });
      continue;
    }
    try {
      // Read again under the lease: the state may have moved since the listing.
      const fresh = await store.read(issueNumber);
      if (fresh.status !== "ok") continue;
      const recovered = await recoverIssue(store, fresh.state, deps);
      if (recovered.state === fresh.state) continue;
      entries.push({
        issueNumber,
        action: "marked-needs-you",
        stage: recovered.state.resumeStage ?? recovered.state.stage,
        ...(recovered.processNote === null ? {} : { processNote: recovered.processNote })
      });
    } finally {
      await leased.lease.release();
    }
  }
  return entries;
};
