import path from "node:path";

import type { Exec, ExecResult } from "../ports";
import { type GitPort, type RefsSnapshot, type RefViolation, type WorktreeEntry } from "./git.port";

const GIT_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 120_000;

/** Git must never prompt and must not take optional locks on read-only calls. */
const GIT_ENV = { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } as const;

/** A failed git call. The message holds a short stderr tail, never stdout. */
export class GitError extends Error {
  override readonly name = "GitError";
  constructor(
    message: string,
    readonly argv: readonly string[],
    /** `null` for a timeout or a process that never started. */
    readonly code: number | null
  ) {
    super(message);
  }
}

const stderrTail = (text: string, max = 300): string => {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > max ? `...${flat.slice(-max)}` : flat;
};

export interface RunGitOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  /** Exit codes besides 0 that are an answer, not a failure. */
  readonly okCodes?: readonly number[];
}

/**
 * Run `git <args>` in `cwd`. Returns the result for exit code 0 or a code in
 * `okCodes`; throws `GitError` for anything else, including a timeout.
 */
export const runGit = async (
  exec: Exec,
  cwd: string,
  args: readonly string[],
  options: RunGitOptions = {}
): Promise<ExecResult> => {
  const argv = ["git", ...args];
  const result = await exec({
    argv,
    cwd,
    env: { ...GIT_ENV, ...options.env },
    timeoutMs: options.timeoutMs ?? GIT_TIMEOUT_MS
  });
  if (result.timedOut) throw new GitError(`git ${args[0] ?? ""} timed out`, argv, null);
  if (result.code === 0 || (result.code !== null && options.okCodes?.includes(result.code))) {
    return result;
  }
  throw new GitError(
    `git ${args.slice(0, 2).join(" ")} failed (exit ${result.code ?? "none"}): ${
      stderrTail(result.stderr) || "no stderr"
    }`,
    argv,
    result.code
  );
};

/** A value placed in argv must never be read by git as an option. */
const assertNotFlag = (what: string, value: string): void => {
  if (value === "" || value.startsWith("-")) {
    throw new RangeError(`Invalid ${what} '${value}'`);
  }
};

const parseWorktrees = (porcelain: string): WorktreeEntry[] => {
  const entries: WorktreeEntry[] = [];
  let current: { path: string; branch: string | null; head: string | null } | null = null;
  for (const field of porcelain.split("\0")) {
    if (field.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: field.slice("worktree ".length), branch: null, head: null };
    } else if (current && field.startsWith("HEAD ")) {
      current.head = field.slice("HEAD ".length);
    } else if (current && field.startsWith("branch ")) {
      current.branch = field.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
  }
  if (current) entries.push(current);
  return entries;
};

const parseRefs = (output: string): Record<string, string> => {
  const refs: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const space = line.indexOf(" ");
    if (space > 0) refs[line.slice(space + 1)] = line.slice(0, space);
  }
  return refs;
};

/** `git config -z --get-regexp` prints `key\nvalue\0` records. */
const parseConfig = (output: string): Record<string, string> => {
  const entries: Record<string, string> = {};
  for (const record of output.split("\0")) {
    const newline = record.indexOf("\n");
    if (newline > 0) {
      // Repeated keys (several fetch refspecs) are kept in order, joined.
      const key = record.slice(0, newline);
      const value = record.slice(newline + 1);
      entries[key] = key in entries ? `${entries[key]}\n${value}` : value;
    }
  }
  return entries;
};

const lines = (text: string): string[] => text.split("\n").filter((line) => line !== "");

export const createGitPort = (exec: Exec): GitPort => {
  const git = (cwd: string, args: readonly string[], options?: RunGitOptions) =>
    runGit(exec, cwd, args, options);

  return {
    fetch: async (repo, remote, branch) => {
      assertNotFlag("remote", remote);
      assertNotFlag("branch", branch);
      await git(repo, ["fetch", "--quiet", remote, branch], { timeoutMs: FETCH_TIMEOUT_MS });
    },

    worktreeAdd: async (repo, request) => {
      assertNotFlag("branch", request.branch);
      assertNotFlag("base", request.base);
      if (!path.isAbsolute(request.dir)) {
        throw new RangeError(`Worktree directory must be an absolute path, got '${request.dir}'`);
      }
      await git(
        repo,
        request.existingBranch === true
          ? ["worktree", "add", request.dir, request.branch]
          : ["worktree", "add", "-b", request.branch, request.dir, request.base]
      );
    },

    worktreeRemove: async (repo, dir, force) => {
      await git(repo, ["worktree", "remove", ...(force ? ["--force"] : []), dir]);
    },

    worktreePrune: async (repo) => {
      await git(repo, ["worktree", "prune"]);
    },

    worktreeList: async (repo) =>
      parseWorktrees((await git(repo, ["worktree", "list", "--porcelain", "-z"])).stdout),

    headSha: async (cwd) => (await git(cwd, ["rev-parse", "--verify", "HEAD"])).stdout.trim(),

    currentBranch: async (cwd) => {
      const result = await git(cwd, ["symbolic-ref", "--short", "-q", "HEAD"], { okCodes: [1] });
      const name = result.stdout.trim();
      return result.code === 0 && name !== "" ? name : null;
    },

    branchExists: async (repo, branch) => {
      assertNotFlag("branch", branch);
      const result = await git(repo, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
        okCodes: [1]
      });
      return result.code === 0;
    },

    statusPorcelain: async (cwd) =>
      (await git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"])).stdout,

    branchRename: async (cwd, from, to) => {
      assertNotFlag("branch", from);
      assertNotFlag("branch", to);
      await git(cwd, ["branch", "-m", from, to]);
    },

    checkRefFormat: async (cwd, branch) => {
      if (branch === "" || branch.startsWith("-")) return false;
      const result = await git(cwd, ["check-ref-format", "--branch", branch], {
        okCodes: [1, 128]
      });
      return result.code === 0;
    },

    mergeBase: async (cwd, a, b) => {
      assertNotFlag("revision", a);
      assertNotFlag("revision", b);
      const result = await git(cwd, ["merge-base", a, b], { okCodes: [1] });
      const base = result.stdout.trim();
      return result.code === 0 && base !== "" ? base : null;
    },

    isAncestor: async (cwd, ancestor, descendant) => {
      assertNotFlag("revision", ancestor);
      assertNotFlag("revision", descendant);
      const result = await git(cwd, ["merge-base", "--is-ancestor", ancestor, descendant], {
        okCodes: [1]
      });
      return result.code === 0;
    },

    refsSnapshot: async (cwd) => {
      const head = await git(cwd, ["rev-parse", "--verify", "-q", "HEAD"], { okCodes: [1] });
      const branch = await git(cwd, ["symbolic-ref", "--short", "-q", "HEAD"], { okCodes: [1] });
      const refs = await git(cwd, ["for-each-ref", "--format=%(objectname) %(refname)"]);
      const remotes = await git(cwd, ["config", "-z", "--get-regexp", "^remote\\."], {
        okCodes: [1]
      });
      const stash = await git(cwd, ["stash", "list", "--format=%H"]);
      return {
        head: head.code === 0 ? head.stdout.trim() : null,
        branch: branch.code === 0 ? branch.stdout.trim() : null,
        refs: parseRefs(refs.stdout),
        remotes: parseConfig(remotes.stdout),
        stash: lines(stash.stdout)
      };
    }
  };
};

const compareRecords = (
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
  kinds: { added: RefViolation["kind"]; moved: RefViolation["kind"]; deleted: RefViolation["kind"] }
): RefViolation[] => {
  const violations: RefViolation[] = [];
  for (const subject of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const was = before[subject] ?? null;
    const now = after[subject] ?? null;
    if (was === now) continue;
    const kind = was === null ? kinds.added : now === null ? kinds.deleted : kinds.moved;
    violations.push({ kind, subject, before: was, after: now });
  }
  return violations;
};

/**
 * The engine invariant: an agent stage must not change HEAD, the branch, any
 * ref (tags, branches, remote-tracking, stash), or a remote's config. Returns
 * every difference; an empty list means the stage left them alone.
 */
export const compareRefs = (before: RefsSnapshot, after: RefsSnapshot): RefViolation[] => {
  const violations: RefViolation[] = [];
  if (before.head !== after.head) {
    violations.push({
      kind: "head-moved",
      subject: "HEAD",
      before: before.head,
      after: after.head
    });
  }
  if (before.branch !== after.branch) {
    violations.push({
      kind: "branch-changed",
      subject: "HEAD",
      before: before.branch,
      after: after.branch
    });
  }
  violations.push(
    ...compareRecords(before.refs, after.refs, {
      added: "ref-added",
      moved: "ref-moved",
      deleted: "ref-deleted"
    }),
    ...compareRecords(before.remotes, after.remotes, {
      added: "remote-changed",
      moved: "remote-changed",
      deleted: "remote-changed"
    })
  );
  if (before.stash.join("\n") !== after.stash.join("\n")) {
    violations.push({
      kind: "stash-changed",
      subject: "stash",
      before: before.stash.join(","),
      after: after.stash.join(",")
    });
  }
  return violations;
};
