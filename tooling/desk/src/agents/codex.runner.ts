import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { jsonFromText } from "./agent.json-value";
import { createAgentProcess, type AgentProcess } from "./agent.process";
import {
  MAX_PROMPT_BYTES,
  schemaIssues,
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRunner,
  type SandboxMode
} from "./agent.runner";
import { createCodexStreamParser } from "./codex.stream";

export { createCodexStreamParser, parseCodexStream, unwrapShellCommand } from "./codex.stream";
export type { CodexStreamParser, CodexStreamSummary } from "./codex.stream";

/** A request the Codex runner refuses on policy grounds. */
export class CodexPolicyError extends Error {
  override readonly name = "CodexPolicyError";
}

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

/**
 * The sandbox a request gets. Codex sandbox modes are coarser than a Claude
 * allowlist, so the rules are fixed in code, not read from the request:
 *
 * - planner, reviewer and intake always run `read-only`, whatever the request says;
 * - a builder is refused unless the request carries the config opt-in
 *   `allowCodexBuilder`, and then it gets `workspace-write` with network off;
 * - `danger-full-access` and every bypass flag are never produced.
 */
export const codexSandboxFor = <T>(request: AgentRunRequest<T>): SandboxMode => {
  if (request.role !== "builder") return "read-only";
  if (request.allowCodexBuilder !== true) {
    throw new CodexPolicyError(
      "A Codex builder is disabled. Set the config opt-in allowCodexBuilder to use one."
    );
  }
  return "workspace-write";
};

/**
 * The one bypass flag the runner can emit. It is for a Codex process that runs
 * inside a Docker container, where the container is the sandbox (and Codex's own
 * sandbox cannot start). Two conditions must hold: the request carries
 * `containerSandbox`, and the runner was built for a container
 * (`CodexRunnerDeps.insideContainer`, set only by the Docker isolation). A host
 * runner refuses such a request.
 */
export const CONTAINER_BYPASS_FLAG = "--dangerously-bypass-approvals-and-sandbox";

const FORBIDDEN_ARGS: readonly RegExp[] = [
  /danger-full-access/,
  /^--dangerously-/,
  /^--full-auto$/,
  /^--yolo$/,
  /^--approve-for-me$/
];

export interface CodexArgFiles {
  /** JSON Schema file for `--output-schema`. */
  readonly schemaPath: string;
  /** File Codex writes its last message to (`-o`). */
  readonly outputPath: string;
}

export interface CodexArgOptions {
  /** True only for a runner that starts Codex inside a Docker container. */
  readonly insideContainer?: boolean;
}

/**
 * Argument list for `codex exec`, without the program name. The prompt comes
 * last, after `--`, so its text can never be read as a flag.
 *
 * A new thread uses `-C` and `-s`. `exec resume` accepts neither (spike,
 * codex-cli 0.147.0), so a resumed thread gets the sandbox through
 * `-c sandbox_mode` and the directory from the process cwd.
 */
export const buildCodexArgs = <T>(
  request: AgentRunRequest<T>,
  files: CodexArgFiles,
  options: CodexArgOptions = {}
): string[] => {
  const container = request.containerSandbox === true;
  if (container && options.insideContainer !== true) {
    throw new CodexPolicyError(
      "containerSandbox is valid only for a runner inside a Docker container. A host run never lowers the sandbox."
    );
  }
  if (container && request.role !== "builder") {
    throw new CodexPolicyError(
      "Only the builder runs without the Codex sandbox, and only in a container."
    );
  }
  if (request.model !== undefined && !MODEL_PATTERN.test(request.model)) {
    throw new CodexPolicyError(`Invalid model name '${request.model}'.`);
  }
  const resuming = request.resumeSessionId !== undefined;
  const args = ["exec"];
  if (resuming) args.push("resume");
  if (container) {
    if (!resuming) args.push("-C", request.cwd);
    args.push(CONTAINER_BYPASS_FLAG);
  } else {
    const sandbox = codexSandboxFor(request);
    if (!resuming) args.push("-C", request.cwd, "-s", sandbox);
    args.push("-c", 'approval_policy="never"');
    if (resuming) args.push("-c", `sandbox_mode="${sandbox}"`);
    if (sandbox === "workspace-write")
      args.push("-c", "sandbox_workspace_write.network_access=false");
  }
  args.push(
    "--ignore-user-config",
    "--json",
    "--output-schema",
    files.schemaPath,
    "-o",
    files.outputPath
  );
  if (request.model !== undefined) args.push("-m", request.model);
  if (request.resumeSessionId !== undefined) args.push(request.resumeSessionId);

  const flags = args.filter(
    (arg) =>
      !(container && arg === CONTAINER_BYPASS_FLAG) &&
      FORBIDDEN_ARGS.some((pattern) => pattern.test(arg))
  );
  if (flags.length > 0) {
    throw new CodexPolicyError(`Refusing unsafe Codex flags: ${flags.join(", ")}`);
  }
  const prompt =
    request.systemAppend === undefined
      ? request.prompt
      : `${request.systemAppend}\n\n${request.prompt}`;
  args.push("--", prompt);
  return args;
};

export interface CodexRunnerDeps {
  readonly process?: AgentProcess;
  /** The program to start. Default `codex`. */
  readonly binary?: string;
  /** A fresh directory for the schema and last-message files. */
  readonly makeTempDir?: () => Promise<string>;
  /**
   * The runner starts Codex inside a Docker container. Only the Docker isolation
   * sets it. It lets a request with `containerSandbox` use the bypass flag.
   */
  readonly insideContainer?: boolean;
  /**
   * Map the host file paths to the paths the process sees. The runner writes the
   * schema to the host path and reads the last message from the host path, and it
   * puts the mapped paths into the arguments.
   */
  readonly argPaths?: (files: CodexArgFiles) => CodexArgFiles;
}

const readOptional = async (file: string): Promise<string | null> => {
  try {
    const text = await readFile(file, "utf8");
    return text.trim() === "" ? null : text;
  } catch {
    return null;
  }
};

export const createCodexRunner = (deps: CodexRunnerDeps = {}): AgentRunner => {
  const spawnProcess = deps.process ?? createAgentProcess();
  const binary = deps.binary ?? "codex";
  const makeTempDir = deps.makeTempDir ?? (() => mkdtemp(path.join(tmpdir(), "kaine-desk-codex-")));

  return {
    run: async <T>(request: AgentRunRequest<T>): Promise<AgentRunOutcome<T>> => {
      const empty = { trace: [], sessionId: null, denials: [] } as const;
      const refuse = (message: string): AgentRunOutcome<T> => ({
        ok: false,
        failure: { kind: "process-error", message, exitCode: null, stderrTail: "" },
        partial: empty
      });
      if (request.provider !== "codex") {
        return refuse(`The Codex runner cannot run a ${request.provider} request.`);
      }
      if (Buffer.byteLength(request.prompt, "utf8") > MAX_PROMPT_BYTES) {
        return refuse(
          `The prompt is larger than ${MAX_PROMPT_BYTES} bytes. Pass large content as a file path.`
        );
      }

      const dir = await makeTempDir();
      try {
        const files = {
          schemaPath: path.join(dir, "output-schema.json"),
          outputPath: path.join(dir, "last-message.txt")
        };
        let args: string[];
        try {
          args = buildCodexArgs(request, deps.argPaths?.(files) ?? files, {
            insideContainer: deps.insideContainer === true
          });
        } catch (error) {
          if (error instanceof CodexPolicyError) return refuse(error.message);
          throw error;
        }
        await writeFile(files.schemaPath, JSON.stringify(request.outputSchema));

        const parser = createCodexStreamParser();
        const run = await spawnProcess({
          argv: [binary, ...args],
          cwd: request.cwd,
          env:
            request.receiptsPath === undefined ? {} : { KAINE_DESK_RECEIPTS: request.receiptsPath },
          timeoutMs: request.timeoutMs,
          signal: request.signal,
          onSpawn: request.onSpawn,
          onLine: (line) => {
            for (const event of parser.push(line)) request.onEvent?.(event);
          }
        });
        const summary = parser.finish();
        const partial = { trace: summary.events, sessionId: summary.threadId, denials: [] };

        if (run.aborted) return { ok: false, failure: { kind: "aborted" }, partial };
        if (run.timedOut) {
          return { ok: false, failure: { kind: "timeout", timeoutMs: request.timeoutMs }, partial };
        }
        if (run.spawnError !== undefined) {
          return {
            ok: false,
            failure: {
              kind: "process-error",
              message: `Cannot start ${binary}: ${run.spawnError}`,
              exitCode: null,
              stderrTail: run.stderrTail
            },
            partial
          };
        }
        if (summary.failure !== null || !summary.completed) {
          if (summary.failure === null && run.code === 0) {
            return {
              ok: false,
              failure: { kind: "no-result", message: "The stream ended before turn.completed." },
              partial
            };
          }
          return {
            ok: false,
            failure: {
              kind: "process-error",
              message: summary.failure ?? `${binary} exited with code ${run.code}.`,
              exitCode: run.code,
              stderrTail: run.stderrTail
            },
            partial
          };
        }

        const resultText = (await readOptional(files.outputPath)) ?? summary.lastMessage ?? "";
        const candidate = jsonFromText(resultText);
        if (candidate === undefined) {
          return {
            ok: false,
            failure: {
              kind: "schema-mismatch",
              issues: [{ path: "", message: "The agent returned no structured output." }]
            },
            partial
          };
        }
        const parsed = request.parse.safeParse(candidate);
        if (!parsed.success) {
          return {
            ok: false,
            failure: { kind: "schema-mismatch", issues: schemaIssues(parsed.error) },
            partial
          };
        }
        return {
          ok: true,
          result: {
            structured: parsed.data,
            sessionId: summary.threadId ?? "",
            usage: summary.usage,
            denials: [],
            trace: summary.events,
            resultText
          }
        };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  };
};
