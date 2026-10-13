import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

import { stopProcessTree } from "../process/process.tree";

export interface AgentProcessRequest {
  readonly argv: readonly string[];
  readonly cwd: string;
  /** Added on top of the allowlisted parent environment. */
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal | undefined;
  /** Called once with the child pid, right after the process starts. */
  readonly onSpawn?: ((pid: number) => void) | undefined;
  /** Called with each complete stdout line, without its newline. */
  readonly onLine: (line: string) => void;
}

export interface AgentProcessResult {
  /** `null` when the process was stopped or never started. */
  readonly code: number | null;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  /** The last part of stderr. It is bounded; it may hold unrelated noise. */
  readonly stderrTail: string;
  /** Set when the program could not start. */
  readonly spawnError?: string | undefined;
}

/** Streams one child process. Tests replace it with a fake. */
export type AgentProcess = (request: AgentProcessRequest) => Promise<AgentProcessResult>;

const STDERR_LIMIT = 8 * 1024;
const MAX_LINE_BYTES = 8 * 1024 * 1024;

/**
 * Variables an agent process may inherit. `GH_TOKEN`, `GITHUB_TOKEN` and
 * `SSH_AUTH_SOCK` are left out on purpose: an agent never pushes or calls
 * GitHub. The rest is what the Claude and Codex CLIs need to find their login.
 */
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
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "COREPACK_HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CODEX_HOME",
  "OPENAI_API_KEY"
]);

export const agentEnv = (
  parent: NodeJS.ProcessEnv,
  extra: Readonly<Record<string, string>> = {}
): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value !== undefined && (ENV_ALLOWLIST.has(key) || key.startsWith("LC_"))) env[key] = value;
  }
  return { ...env, ...extra };
};

const tail = (text: string, limit: number): string =>
  text.length > limit ? text.slice(text.length - limit) : text;

/**
 * The real `AgentProcess`. It spawns without a shell, closes stdin, passes an
 * allowlisted environment and splits stdout into lines as they arrive. On
 * timeout or abort it stops the whole process tree before it resolves. It
 * never rejects.
 */
export const createAgentProcess =
  (parentEnv: NodeJS.ProcessEnv = process.env): AgentProcess =>
  (request) =>
    new Promise<AgentProcessResult>((resolve) => {
      const [command, ...args] = request.argv;
      if (command === undefined || command === "") {
        resolve({
          code: null,
          timedOut: false,
          aborted: false,
          stderrTail: "",
          spawnError: "empty argv"
        });
        return;
      }
      if (request.signal?.aborted) {
        resolve({ code: null, timedOut: false, aborted: true, stderrTail: "" });
        return;
      }

      let stderr = "";
      let pending = "";
      let timedOut = false;
      let aborted = false;
      let settled = false;
      let spawnError: string | undefined;
      const decoder = new StringDecoder("utf8");

      const child = spawn(command, args, {
        cwd: request.cwd,
        env: agentEnv(parentEnv, request.env),
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      if (child.pid !== undefined) request.onSpawn?.(child.pid);

      const emitLines = (flush: boolean) => {
        let newline = pending.indexOf("\n");
        while (newline >= 0) {
          const line = pending.slice(0, newline).replace(/\r$/, "");
          pending = pending.slice(newline + 1);
          if (line !== "") request.onLine(line);
          newline = pending.indexOf("\n");
        }
        if (flush && pending.trim() !== "") request.onLine(pending.trim());
        if (flush) pending = "";
        // A stream without newlines must not grow without bound.
        if (pending.length > MAX_LINE_BYTES) pending = "";
      };

      child.stdout.on("data", (data: Buffer) => {
        pending += decoder.write(data);
        emitLines(false);
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr = tail(stderr + data.toString("utf8"), STDERR_LIMIT);
      });

      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        request.signal?.removeEventListener("abort", onAbort);
        pending += decoder.end();
        emitLines(true);
        resolve({
          code,
          timedOut,
          aborted,
          stderrTail: stderr.trim(),
          ...(spawnError === undefined ? {} : { spawnError })
        });
      };

      const stop = () => {
        void stopProcessTree(child).then(() => finish(null));
      };
      const timer = setTimeout(() => {
        timedOut = true;
        stop();
      }, request.timeoutMs);
      function onAbort() {
        aborted = true;
        stop();
      }
      request.signal?.addEventListener("abort", onAbort, { once: true });

      child.once("error", (error) => {
        spawnError = error.message;
        finish(null);
      });
      child.once("close", (code) => finish(timedOut || aborted ? null : code));
    });
