import type { Exec } from "../ports";
import { boundedTail } from "../process/process.output";

/**
 * The git commands the ship step runs through `Exec`. Each is one argv array,
 * built here and nowhere else, so the safety rules can be read in one place:
 *
 * - no `--no-verify`: hooks run for `commit` and `push`;
 * - no force flag, no `-f`, no `+refspec`: a rejected push is an answer;
 * - no `add -A`, `add .` or `commit -a`: only an explicit file list is staged;
 * - pathspecs are literal and arrive on stdin, never as a shell string.
 */

const GIT_ENV = {
  GIT_TERMINAL_PROMPT: "0",
  // Rebase and commit must never wait for an editor.
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true"
} as const;

export interface GitOutcome {
  readonly ok: boolean;
  readonly code: number | null;
  readonly stdout: string;
  /** stdout and stderr together, colour removed, bounded. For logs and failure reports. */
  readonly log: string;
  readonly timedOut: boolean;
}

export interface GitCallOptions {
  readonly input?: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
}

export const runGitSafely = async (
  exec: Exec,
  cwd: string,
  args: readonly string[],
  options: GitCallOptions = {}
): Promise<GitOutcome> => {
  const result = await exec({
    argv: ["git", ...args],
    cwd,
    env: { ...GIT_ENV, ...options.env },
    timeoutMs: options.timeoutMs ?? 120_000,
    input: options.input
  });
  const combined = [result.stdout, result.stderr].filter((part) => part !== "").join("\n");
  return {
    ok: result.code === 0,
    code: result.code,
    stdout: result.stdout,
    log: boundedTail(combined, 120, 8000),
    timedOut: result.timedOut
  };
};

export interface GitIdentity {
  readonly name: string;
  readonly email: string;
}

/** `user.name` and `user.email` as git would use them for a commit. Empty strings when unset. */
export const readGitIdentity = async (exec: Exec, cwd: string): Promise<GitIdentity> => {
  const read = async (key: string): Promise<string> =>
    (await runGitSafely(exec, cwd, ["config", "--get", key])).stdout.trim();
  return { name: await read("user.name"), email: await read("user.email") };
};

/** Make the index equal to HEAD. The working files stay as they are. */
export const unstageAll = (exec: Exec, cwd: string): Promise<GitOutcome> =>
  runGitSafely(exec, cwd, ["reset", "--quiet"]);

/**
 * Stage exactly `files`. The list goes on stdin (NUL separated) and pathspecs
 * are literal, so a name with glob characters or a leading dash is one file.
 */
export const stageFiles = (
  exec: Exec,
  cwd: string,
  files: readonly string[]
): Promise<GitOutcome> =>
  runGitSafely(exec, cwd, ["add", "--pathspec-from-file=-", "--pathspec-file-nul"], {
    input: files.join("\0"),
    env: { GIT_LITERAL_PATHSPECS: "1" }
  });

/** Paths staged against HEAD. */
export const stagedPaths = async (exec: Exec, cwd: string): Promise<string[] | null> => {
  const outcome = await runGitSafely(exec, cwd, ["diff", "--cached", "--name-only", "-z"]);
  return outcome.ok ? outcome.stdout.split("\0").filter((entry) => entry !== "") : null;
};

/** Commit the index with the message in `messageFile`. Hooks run. */
export const commitStaged = (
  exec: Exec,
  cwd: string,
  messageFile: string,
  timeoutMs: number
): Promise<GitOutcome> => runGitSafely(exec, cwd, ["commit", "--file", messageFile], { timeoutMs });

export const rebaseOnto = (
  exec: Exec,
  cwd: string,
  upstream: string,
  timeoutMs: number
): Promise<GitOutcome> => runGitSafely(exec, cwd, ["rebase", upstream], { timeoutMs });

export const rebaseAbort = (exec: Exec, cwd: string): Promise<GitOutcome> =>
  runGitSafely(exec, cwd, ["rebase", "--abort"]);

/** Files with unresolved conflicts. */
export const conflictedFiles = async (exec: Exec, cwd: string): Promise<string[]> => {
  const outcome = await runGitSafely(exec, cwd, ["diff", "--name-only", "--diff-filter=U", "-z"]);
  return outcome.stdout.split("\0").filter((entry) => entry !== "");
};

/** `git push -u origin <branch>`. A normal push: it never forces and never skips hooks. */
export const pushBranch = (
  exec: Exec,
  cwd: string,
  branch: string,
  timeoutMs: number
): Promise<GitOutcome> => {
  if (branch === "" || branch.startsWith("-") || branch.startsWith("+")) {
    throw new RangeError(`Invalid branch '${branch}'`);
  }
  return runGitSafely(exec, cwd, ["push", "-u", "origin", branch], { timeoutMs });
};

/** True when `path` exists in the commit HEAD points at. */
export const existsInHead = async (exec: Exec, cwd: string, path: string): Promise<boolean> =>
  (await runGitSafely(exec, cwd, ["cat-file", "-e", `HEAD:${path}`])).ok;

export const revParse = async (exec: Exec, cwd: string, ref: string): Promise<string | null> => {
  const outcome = await runGitSafely(exec, cwd, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${ref}^{commit}`
  ]);
  const sha = outcome.stdout.trim();
  return outcome.ok && sha !== "" ? sha : null;
};

/** A push that the remote answered with a refusal (not a hook or a network error). */
export const looksRejected = (log: string): boolean =>
  /\[(?:remote )?rejected\]|non-fast-forward|fetch first|Updates were rejected|protected branch|hook declined|denied to|permission to .* denied/i.test(
    log
  );

/** A message from git itself, as opposed to a hook's own output. */
export const looksLikeGitError = (log: string): boolean =>
  /Author identity unknown|nothing (?:added )?to commit|^fatal: /m.test(log) &&
  !/husky|hook/i.test(log);
