import { realpath, rm, stat } from "node:fs/promises";
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
  install: 15 * 60_000,
  "env-ensure": 5 * 60_000,
  "ai-install": 5 * 60_000,
  "ai-doctor": 3 * 60_000
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

  /** One git step through the port. A `GitError` fails the step with its exit code. */
  const gitStep = async <T>(
    id: string,
    run: () => Promise<T>
  ): Promise<{ readonly value: T } | { readonly failed: CreateWorktreeResult }> => {
    try {
      return { value: await run() };
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
      return { failed: failure(id, error.code, `${id} failed`, error.message) };
    }
  };

  if (mode !== "reuse") {
    const format = await gitStep("check-branch", () => git.checkRefFormat(repoDir, branch));
    if ("failed" in format) return format.failed;
    if (!format.value) return failure("check-branch", 1, `git rejects the branch name ${branch}`);
    const fetched = await gitStep("fetch-base", () => git.fetch(repoDir, "origin", input.base));
    if ("failed" in fetched) return fetched.failed;
    const added = await gitStep("worktree-add", () =>
      git.worktreeAdd(repoDir, {
        branch,
        dir: worktreeDir,
        base: baseRef,
        existingBranch: mode === "attach"
      })
    );
    if ("failed" in added) return added.failed;
  }

  const plan = bootstrapPlan({ ...input, worktreeDir });
  for (const step of plan.steps) {
    const result = await exec({
      argv: step.argv,
      cwd: worktreeDir,
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
  }

  // A reused tree may hold work, so only a new one must be clean after setup.
  if (mode !== "reuse") {
    const status = await gitStep("baseline-status", () => git.statusPorcelain(worktreeDir));
    if ("failed" in status) return status.failed;
    if (status.value.trim() !== "") {
      return failure(
        "baseline-status",
        0,
        "baseline-status: the fresh worktree is not clean",
        boundedTail(status.value, 60, 4000)
      );
    }
  }

  // A new branch starts at the base. Any other branch forks from it somewhere earlier.
  let baseSha: string | null = null;
  if (mode === "fresh") {
    const head = await gitStep("base-head", () => git.headSha(worktreeDir));
    if ("failed" in head) return head.failed;
    baseSha = head.value;
  } else {
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

/** The desk names every task worktree `KAINE-<issue>`. Only such a folder may be a leftover of one. */
const DESK_WORKTREE_NAME = /^KAINE-[1-9]\d*(?:-|$)/;

/**
 * A worktree that git already gave up: no registration, no `.git` link, but files left. Git
 * removes the registration and the link first and the files last, so a failure on the files
 * (paths longer than Windows allows, a file another process holds) leaves this.
 */
const isLeftover = async (worktreePath: string): Promise<boolean> =>
  DESK_WORKTREE_NAME.test(path.basename(worktreePath)) &&
  !(await exists(path.join(worktreePath, ".git")));

/** Delete what git left of a worktree. Node removes long Windows paths and retries busy files. */
const deleteLeftover = (worktreePath: string): Promise<void> =>
  rm(worktreePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

/**
 * Remove a task worktree and keep its branch. It refuses a tree with
 * uncommitted changes (including untracked files) unless `force` is set, and
 * refuses a directory that is not a worktree of this repository. When git
 * unregistered the worktree but could not delete its files, the desk finishes
 * the deletion. A leftover from an earlier such failure goes only with `force`.
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
      if (!(await isLeftover(worktreePath))) {
        return {
          ok: false,
          reason: "not-a-worktree",
          detail: `${worktreePath} is not a worktree of this repository`
        };
      }
      if (!force) {
        return {
          ok: false,
          reason: "not-a-worktree",
          detail: `${worktreePath} is what an earlier removal left: git no longer knows it, but its files remain. Remove with force to delete the folder.`
        };
      }
      await deleteLeftover(worktreePath);
      await git.worktreePrune(repoDir);
      return { ok: true, removed: true };
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
    // Git may have unregistered the worktree before it failed on the files. Then it is ours to finish.
    const stillRegistered = await Promise.all(
      (await git.worktreeList(repoDir)).map(
        async (entry) => (await realOrResolved(entry.path)) === target
      )
    );
    if (stillRegistered.includes(true) || !(await isLeftover(worktreePath))) {
      return { ok: false, reason: "git-failed", detail: error.message };
    }
    await deleteLeftover(worktreePath);
    await git.worktreePrune(repoDir);
  }
  return { ok: true, removed: true };
};
