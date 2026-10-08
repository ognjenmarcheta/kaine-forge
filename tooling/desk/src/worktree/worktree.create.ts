import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { bootstrapPlan, evaluateStep, type BootstrapInput } from "../engine/worktree.bootstrap";
import { GitError, type GitPort } from "../git";
import type { Exec } from "../ports";
import { boundedTail } from "../process/process.output";

export interface WorktreeDeps {
  readonly exec: Exec;
  readonly git: GitPort;
  /** Per step id (`install`, `ai-doctor-claude` as `ai-doctor`). Overrides the defaults. */
  readonly timeoutsMs?: Readonly<Record<string, number>>;
  readonly log?: (message: string) => void;
}

export interface CreateWorktreeRequest {
  /** The main checkout. Git commands that create the worktree run here. */
  readonly repoDir: string;
  readonly input: BootstrapInput;
}

export type CreateWorktreeResult =
  | {
      readonly ok: true;
      readonly worktreePath: string;
      /** Commit the diff is taken against. */
      readonly baseSha: string;
      readonly branch: string;
      /** True when a valid worktree for the branch was already there. */
      readonly reused: boolean;
    }
  | {
      readonly ok: false;
      /** Id of the step that failed, or `verify-existing`. */
      readonly step: string;
      /** Exit code, `null` for a timeout or a failure that is not a process exit. */
      readonly code: number | null;
      readonly reason: string;
      /** Bounded tail of the step output. */
      readonly tail: string;
    };

/** Generous because `install` may fetch packages. A step that hangs longer is stuck. */
const DEFAULT_TIMEOUTS_MS: Readonly<Record<string, number>> = {
  "check-branch": 15_000,
  "fetch-base": 120_000,
  "worktree-add": 60_000,
  install: 15 * 60_000,
  "env-ensure": 5 * 60_000,
  "ai-install": 5 * 60_000,
  "ai-doctor": 3 * 60_000,
  "baseline-status": 30_000,
  "base-head": 15_000
};
const FALLBACK_TIMEOUT_MS = 5 * 60_000;

const timeoutFor = (deps: WorktreeDeps, id: string): number => {
  const key = id.startsWith("ai-doctor-") ? "ai-doctor" : id;
  return (
    deps.timeoutsMs?.[id] ??
    deps.timeoutsMs?.[key] ??
    DEFAULT_TIMEOUTS_MS[key] ??
    FALLBACK_TIMEOUT_MS
  );
};

const realOrResolved = async (target: string): Promise<string> => {
  try {
    return await realpath(target);
  } catch {
    return path.resolve(target);
  }
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

type Mode = "fresh" | "attach" | "reuse";

/** Steps the mode does not need. A reused tree may hold work, so it skips the clean-tree check. */
const SKIPPED: Readonly<Record<Mode, ReadonlySet<string>>> = {
  fresh: new Set(),
  attach: new Set(["base-head"]),
  reuse: new Set(["check-branch", "fetch-base", "worktree-add", "baseline-status", "base-head"])
};

const failure = (
  step: string,
  code: number | null,
  reason: string,
  tail = ""
): CreateWorktreeResult => ({ ok: false, step, code, reason, tail });

/**
 * Create the task worktree by running the bootstrap recipe, or finish setting
 * up one that already exists. Safe to call again:
 *
 * - The directory exists and is a worktree of the same branch whose history
 *   reaches `origin/<base>`: reuse it. Only the setup steps run again
 *   (install, env, AI files, doctor). Nothing is fetched, reset or cleaned.
 * - The directory is gone but the branch is still there: check the branch out.
 * - Otherwise create the branch from `origin/<base>`.
 *
 * Nothing runs with `--force`. A failed step leaves the tree as it is, so a
 * retry reuses it. `baseSha` is the fork point from `origin/<base>`.
 */
export const createWorktree = async (
  deps: WorktreeDeps,
  request: CreateWorktreeRequest
): Promise<CreateWorktreeResult> => {
  const { exec, git } = deps;
  const { repoDir, input } = request;
  const log = deps.log ?? (() => undefined);
  const worktreeDir = path.resolve(input.worktreeDir);
  const baseRef = `origin/${input.base}`;
  const { branch } = bootstrapPlan(input);

  let mode: Mode = "fresh";
  if (await exists(worktreeDir)) {
    const entries = await git.worktreeList(repoDir);
    const target = await realOrResolved(worktreeDir);
    let found: (typeof entries)[number] | undefined;
    for (const entry of entries) {
      if ((await realOrResolved(entry.path)) === target) found = entry;
    }
    if (found?.branch !== branch) {
      return failure(
        "verify-existing",
        null,
        found === undefined
          ? `${worktreeDir} exists but is not a worktree of this repository`
          : `${worktreeDir} is a worktree on ${found.branch ?? "a detached HEAD"}, not ${branch}`
      );
    }
    mode = "reuse";
  } else {
    // A worktree whose directory was deleted by hand still blocks `worktree add`.
    await git.worktreePrune(repoDir);
    if (await git.branchExists(repoDir, branch)) mode = "attach";
  }
  log(`worktree ${mode}: ${worktreeDir}`);

  const plan = bootstrapPlan({ ...input, worktreeDir, existingBranch: mode === "attach" });
  let recordedBase: string | null = null;
  for (const step of plan.steps) {
    if (SKIPPED[mode].has(step.id)) continue;
    const dir = step.cwd === "repo" ? repoDir : worktreeDir;
    const result = await exec({
      argv: step.argv,
      cwd: dir,
      env: { NO_COLOR: "1" },
      timeoutMs: timeoutFor(deps, step.id)
    });
    const output = [result.stdout, result.stderr].filter((part) => part !== "").join("\n");
    const verdict = evaluateStep(step, result);
    if (!verdict.ok) {
      const note = result.timedOut ? `${step.id} timed out. ` : "";
      return failure(
        step.id,
        result.code,
        `${note}${verdict.reason}`,
        boundedTail(output, 60, 4000)
      );
    }
    if (verdict.recorded) recordedBase = verdict.recorded.baseHead;
  }

  let baseSha = recordedBase;
  if (mode !== "fresh" || baseSha === null) {
    try {
      baseSha = await git.mergeBase(worktreeDir, "HEAD", baseRef);
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
      return failure("verify-base", error.code, `cannot compare with ${baseRef}`, error.message);
    }
    if (baseSha === null) {
      return failure("verify-base", null, `${branch} shares no history with ${baseRef}`);
    }
  }
  return { ok: true, worktreePath: worktreeDir, baseSha, branch, reused: mode === "reuse" };
};

export interface RemoveWorktreeRequest {
  readonly repoDir: string;
  readonly worktreePath: string;
  /** Remove even with uncommitted changes. */
  readonly force: boolean;
}

export type RemoveWorktreeResult =
  | { readonly ok: true; readonly removed: boolean }
  | {
      readonly ok: false;
      readonly reason: "dirty" | "not-a-worktree" | "git-failed";
      readonly detail: string;
    };

/**
 * Remove a task worktree and keep its branch. It refuses a tree with
 * uncommitted changes (including untracked files) unless `force` is set, and
 * refuses a directory that is not a worktree of this repository.
 */
export const removeWorktree = async (
  deps: Pick<WorktreeDeps, "git">,
  request: RemoveWorktreeRequest
): Promise<RemoveWorktreeResult> => {
  const { git } = deps;
  const { repoDir, force } = request;
  const worktreePath = path.resolve(request.worktreePath);
  const target = await realOrResolved(worktreePath);

  const entries = await git.worktreeList(repoDir);
  let registered = false;
  for (const entry of entries) {
    if ((await realOrResolved(entry.path)) === target) registered = true;
  }
  if (!registered) {
    if (await exists(worktreePath)) {
      return {
        ok: false,
        reason: "not-a-worktree",
        detail: `${worktreePath} is not a worktree of this repository`
      };
    }
    await git.worktreePrune(repoDir);
    return { ok: true, removed: false };
  }
  if (target === (await realOrResolved(repoDir))) {
    return { ok: false, reason: "not-a-worktree", detail: "That is the main checkout" };
  }

  try {
    if (!force && (await exists(worktreePath))) {
      const status = (await git.statusPorcelain(worktreePath)).trim();
      if (status !== "") {
        return { ok: false, reason: "dirty", detail: boundedTail(status, 20, 2000) };
      }
    }
    await git.worktreeRemove(repoDir, worktreePath, force);
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    return { ok: false, reason: "git-failed", detail: error.message };
  }
  return { ok: true, removed: true };
};
