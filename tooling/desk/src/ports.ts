import { spawn } from "node:child_process";
import path from "node:path";

import type { LabelChange, LabelDefinition } from "./github/github.labels";
import type { CreatePullRequestRequest, PullRequestInfo } from "./github/github.pull-request";
import type { IssueSnapshot, RepositoryInfo, StatusCommentResult } from "./github/github.types";
import { stopProcessTree } from "./process/process.tree";

/** One command as an argv array. The desk never runs a shell string. */
export interface ExecRequest {
  readonly argv: readonly string[];
  readonly cwd?: string | undefined;
  /** Added on top of the allowlisted parent environment. */
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number | undefined;
  /** Written to stdin, then stdin closes. */
  readonly input?: string | undefined;
}

export interface ExecResult {
  /** `null` when the process was killed (timeout) or never started. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  /** True when output passed the cap and the rest was dropped. */
  readonly truncated: boolean;
}

export type Exec = (request: ExecRequest) => Promise<ExecResult>;

export interface Clock {
  readonly now: () => Date;
}

export const systemClock: Clock = { now: () => new Date() };

/**
 * Everything the engine needs from GitHub. The real implementation shells out
 * to `gh` (`createGitHubPort`); tests use fakes. Write methods may throw: the
 * callers that must not fail wrap them in best-effort helpers.
 */
export interface GitHubPort {
  readonly repository: () => Promise<RepositoryInfo>;
  /** Login that `gh` authenticates as. */
  readonly viewer: () => Promise<string>;
  readonly fetchIssue: (issueNumber: number) => Promise<IssueSnapshot>;
  readonly editLabels: (issueNumber: number, change: LabelChange) => Promise<void>;
  /** Create or edit in place the one desk status comment on the issue. */
  readonly upsertStatusComment: (issueNumber: number, body: string) => Promise<StatusCommentResult>;
  readonly createLabel: (definition: LabelDefinition) => Promise<void>;
  /** The open PR whose head is `branch`, or `null`. */
  readonly findPullRequest: (branch: string) => Promise<PullRequestInfo | null>;
  /** Open a DRAFT PR. The request type allows no other value. */
  readonly createPullRequest: (request: CreatePullRequestRequest) => Promise<PullRequestInfo>;
  readonly addPullRequestLabel: (pr: number, label: string) => Promise<void>;
  /** Replace the issue body. Only the owner's confirmed apply of an intake draft calls it. */
  readonly editIssueBody: (issueNumber: number, body: string) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Parent variables a child may inherit. Everything else is dropped. */
const ENV_ALLOWLIST: ReadonlySet<string> = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "TERM",
  "NO_COLOR",
  "SSH_AUTH_SOCK",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "GH_HOST",
  "GH_CONFIG_DIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "COREPACK_HOME",
  "SystemRoot",
  "PATHEXT",
  // Windows keeps the user profile there, and with it the `gh` login and the git config.
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "TEMP",
  "TMP"
]);
const ENV_ALLOWLIST_UPPER: ReadonlySet<string> = new Set(
  [...ENV_ALLOWLIST].map((key) => key.toUpperCase())
);

/** Windows names are case-insensitive: a shell may hand over `Path` instead of `PATH`. */
const allowlistedEnv = (
  parent: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): Record<string, string> => {
  const allowed = (key: string): boolean =>
    platform === "win32" ? ENV_ALLOWLIST_UPPER.has(key.toUpperCase()) : ENV_ALLOWLIST.has(key);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value !== undefined && (allowed(key) || key.startsWith("LC_"))) env[key] = value;
  }
  return env;
};

/**
 * On Windows `pnpm` is a `.cmd` shim, and a spawn without a shell cannot start one. A desk
 * started through `pnpm desk` has the real pnpm in `npm_execpath`, so it runs that instead:
 * an executable as it is, a `.js` or `.cjs` entry with this Node. Still no shell.
 */
export const resolveArgv = (
  argv: readonly string[],
  platform: NodeJS.Platform,
  parent: NodeJS.ProcessEnv,
  nodePath: string = process.execPath
): readonly string[] => {
  const [command, ...args] = argv;
  const pnpm = parent["npm_execpath"];
  if (platform !== "win32" || command !== "pnpm" || pnpm === undefined) return argv;
  if (!/^pnpm/i.test(path.basename(pnpm))) return argv;
  return /\.c?js$/i.test(pnpm) ? [nodePath, pnpm, ...args] : [pnpm, ...args];
};

export interface ExecOptions {
  readonly maxOutputBytes?: number;
  readonly defaultTimeoutMs?: number;
  readonly parentEnv?: NodeJS.ProcessEnv;
  /** For tests. Default: this process's platform. */
  readonly platform?: NodeJS.Platform;
}

/**
 * The real `Exec`. It spawns without a shell, passes an allowlisted
 * environment, caps captured output, and on timeout stops the whole process
 * tree. It never rejects: failures come back as a result with `code: null`.
 */
export const createExec =
  (options: ExecOptions = {}): Exec =>
  (request) =>
    new Promise<ExecResult>((resolve) => {
      const platform = options.platform ?? process.platform;
      const parentEnv = options.parentEnv ?? process.env;
      const [command, ...args] = resolveArgv(request.argv, platform, parentEnv);
      if (command === undefined || command === "") {
        resolve({
          code: null,
          stdout: "",
          stderr: "empty argv",
          timedOut: false,
          truncated: false
        });
        return;
      }
      const cap = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
      const timeoutMs = request.timeoutMs ?? options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
      const env = { ...allowlistedEnv(parentEnv, platform), ...request.env };

      const chunks: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] };
      const sizes = { stdout: 0, stderr: 0 };
      let truncated = false;
      let timedOut = false;
      let settled = false;
      let spawnError: string | null = null;

      const child = spawn(command, args, {
        cwd: request.cwd,
        env,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });

      const collect = (stream: "stdout" | "stderr") => (data: Buffer) => {
        const room = cap - sizes[stream];
        if (room <= 0) {
          truncated = true;
          return;
        }
        const slice = data.length > room ? data.subarray(0, room) : data;
        if (slice.length < data.length) truncated = true;
        sizes[stream] += slice.length;
        chunks[stream].push(slice.toString("utf8"));
      };
      child.stdout.on("data", collect("stdout"));
      child.stderr.on("data", collect("stderr"));

      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const stderr = chunks.stderr.join("");
        resolve({
          code,
          stdout: chunks.stdout.join(""),
          stderr: spawnError === null ? stderr : `${spawnError}\n${stderr}`.trim(),
          timedOut,
          truncated
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        void stopProcessTree(child).then(() => finish(null));
      }, timeoutMs);

      child.once("error", (error) => {
        spawnError = error.message;
        finish(null);
      });
      child.once("close", (code) => finish(timedOut ? null : code));

      // A child that exits early closes stdin; ignore the resulting EPIPE.
      child.stdin.on("error", () => undefined);
      child.stdin.end(request.input ?? "");
    });
