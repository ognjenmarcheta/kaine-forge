import type { Exec, ExecResult } from "../ports";
import { boundedTail } from "../process/process.output";

/**
 * The one place the desk starts a git process. Every git command outside the tests goes
 * through `runGit` (a failure throws) or `tryGit` (a failure is a value), with `GIT_ENV`.
 */

const GIT_TIMEOUT_MS = 60_000;

/**
 * The environment of every git command the desk runs. Git never prompts, takes no optional
 * lock (a read must not block an agent's own git call), and never waits for an editor (a
 * rebase or a commit runs unattended).
 */
const GIT_ENV = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true"
} as const;

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
  /** Text for git's stdin. */
  readonly input?: string;
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
    timeoutMs: options.timeoutMs ?? GIT_TIMEOUT_MS,
    ...(options.input === undefined ? {} : { input: options.input })
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

/** A git call whose failure is an answer (a rejected push, a hook that failed), not an error. */
export interface GitOutcome {
  readonly ok: boolean;
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** stdout and stderr together, bounded. For logs and failure reports. */
  readonly log: string;
  readonly timedOut: boolean;
}

/** Run `git <args>` in `cwd` and return the outcome. It never throws for an exit code. */
export const tryGit = async (
  exec: Exec,
  cwd: string,
  args: readonly string[],
  options: RunGitOptions = {}
): Promise<GitOutcome> => {
  const result = await exec({
    argv: ["git", ...args],
    cwd,
    env: { ...GIT_ENV, ...options.env },
    timeoutMs: options.timeoutMs ?? GIT_TIMEOUT_MS,
    ...(options.input === undefined ? {} : { input: options.input })
  });
  const combined = [result.stdout, result.stderr].filter((part) => part !== "").join("\n");
  return {
    ok: result.code === 0,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    log: boundedTail(combined, 120, 8000),
    timedOut: result.timedOut
  };
};
