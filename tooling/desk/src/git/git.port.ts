/**
 * Everything the engine needs from git. The real implementation shells out
 * through `Exec` (`createGitPort`). Methods take the directory to run in, so
 * one port serves the main checkout and every worktree. A failed git call
 * throws `GitError`; a missing branch or detached HEAD is a normal `null`.
 */

export interface WorktreeEntry {
  /** Absolute path as git prints it (symlinks resolved). */
  readonly path: string;
  /** Short branch name, or `null` when the worktree has a detached HEAD. */
  readonly branch: string | null;
  readonly head: string | null;
}

/**
 * The refs an agent stage must not change. Two snapshots are compared with
 * `compareRefs`.
 */
export interface RefsSnapshot {
  /** Commit HEAD points at, `null` on an unborn branch. */
  readonly head: string | null;
  /** Short branch name, `null` when HEAD is detached. */
  readonly branch: string | null;
  /** Every ref (branches, tags, remote-tracking, stash) mapped to its object id. */
  readonly refs: Readonly<Record<string, string>>;
  /** `remote.<name>.<key>` config entries, such as URLs. */
  readonly remotes: Readonly<Record<string, string>>;
  /** One line per stash entry. */
  readonly stash: readonly string[];
}

export const REF_VIOLATION_KINDS = [
  "head-moved",
  "branch-changed",
  "ref-added",
  "ref-moved",
  "ref-deleted",
  "remote-changed",
  "stash-changed"
] as const;
export type RefViolationKind = (typeof REF_VIOLATION_KINDS)[number];

export interface RefViolation {
  readonly kind: RefViolationKind;
  /** The ref, remote key or label the violation is about. */
  readonly subject: string;
  readonly before: string | null;
  readonly after: string | null;
}

export interface WorktreeAddRequest {
  readonly branch: string;
  readonly dir: string;
  /** Start point such as `origin/main`. Ignored when `existingBranch` is true. */
  readonly base: string;
  /** Check out a branch that already exists instead of creating it. */
  readonly existingBranch?: boolean;
}

export interface GitPort {
  /** `git fetch <remote> <branch>`. */
  readonly fetch: (repo: string, remote: string, branch: string) => Promise<void>;
  /** Create a worktree on a new branch (or an existing one). Never forces. */
  readonly worktreeAdd: (repo: string, request: WorktreeAddRequest) => Promise<void>;
  /** Remove a worktree. `force` also removes one with local changes. The branch stays. */
  readonly worktreeRemove: (repo: string, dir: string, force: boolean) => Promise<void>;
  /** Forget worktrees whose directory is gone. Touches no existing worktree. */
  readonly worktreePrune: (repo: string) => Promise<void>;
  readonly worktreeList: (repo: string) => Promise<readonly WorktreeEntry[]>;
  readonly headSha: (cwd: string) => Promise<string>;
  /** Short branch name, or `null` when HEAD is detached. */
  readonly currentBranch: (cwd: string) => Promise<string | null>;
  readonly branchExists: (repo: string, branch: string) => Promise<boolean>;
  /** `git status --porcelain=v1`, untracked files included, ignored files not. */
  readonly statusPorcelain: (cwd: string) => Promise<string>;
  readonly branchRename: (cwd: string, from: string, to: string) => Promise<void>;
  /** True when `git check-ref-format --branch` accepts the name. */
  readonly checkRefFormat: (cwd: string, branch: string) => Promise<boolean>;
  /** Best common ancestor of `a` and `b`, or `null` when they share no history. */
  readonly mergeBase: (cwd: string, a: string, b: string) => Promise<string | null>;
  /** True when `ancestor` is reachable from `descendant`. */
  readonly isAncestor: (cwd: string, ancestor: string, descendant: string) => Promise<boolean>;
  readonly refsSnapshot: (cwd: string) => Promise<RefsSnapshot>;
}
