import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { jsonFromText } from "./agent.json-value";
import { createAgentProcess, type AgentProcess } from "./agent.process";
import {
  MAX_PROMPT_BYTES,
  schemaIssues,
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRunner
} from "./agent.runner";
import { toOpencodePermissions } from "./opencode.permissions";
import { createOpencodeStreamParser } from "./opencode.stream";

export { createOpencodeStreamParser, parseOpencodeStream } from "./opencode.stream";
export type { OpencodeStreamParser, OpencodeStreamSummary } from "./opencode.stream";

/** A request the OpenCode runner refuses. */
export class OpencodePolicyError extends Error {
  override readonly name = "OpencodePolicyError";
}

/** `provider/model`, with an optional `#variant`. The provider part picks the API host. */
export const OPENCODE_MODEL_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._:/-]+(?:#[A-Za-z0-9._-]+)?$/;

/** The lowest OpenCode version the desk runs: 2.2.3 keeps the last `step_finish`, 2.2.4 keeps loopback off the proxy. */
export const OPENCODE_MIN_VERSION = "2.2.4";

/**
 * Argument list for `opencode run`, without the program name. The prompt comes last.
 *
 * - `--standalone` gives the run a private server with this process's environment. The
 *   shared background service reads its environment only when it starts.
 * - There is no `--auto`: a tool the rules do not allow is refused at once, and the run
 *   never waits for an answer.
 * - OpenCode has no flag for structured output, so the prompt asks for one JSON object.
 */
export const buildOpencodeArgs = <T>(request: AgentRunRequest<T>): string[] => {
  if (request.model === undefined) {
    throw new OpencodePolicyError(
      "An OpenCode run needs a model, for example anthropic/claude-haiku-4-5. Set models.<role> in the desk config."
    );
  }
  if (!OPENCODE_MODEL_PATTERN.test(request.model)) {
    throw new OpencodePolicyError(
      `Invalid OpenCode model '${request.model}'. Use provider/model or provider/model#variant.`
    );
  }
  const args = ["run", "--standalone", "--format", "json", "-m", request.model];
  if (request.resumeSessionId !== undefined) args.push("--session", request.resumeSessionId);
  args.push("--title", `desk-${request.role}`);
  const answer = `Reply with only one JSON object that matches this JSON Schema, and no other text:\n${JSON.stringify(request.outputSchema)}`;
  const body =
    request.systemAppend === undefined
      ? request.prompt
      : `${request.systemAppend}\n\n${request.prompt}`;
  args.push(`${body}\n\n${answer}`);
  return args;
};

/**
 * Environment for one run. The config directory holds only the desk's rules, and project
 * config is off, so a user or project rule cannot reopen what the desk denies.
 */
export const opencodeEnv = (cwd: string, configDir: string): Record<string, string> => ({
  // `opencode run` has no directory flag: it uses `$PWD`, then the process cwd.
  PWD: cwd,
  OPENCODE_CONFIG_DIR: configDir,
  OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  OPENCODE_DISABLE_AUTOUPDATE: "1",
  OPENCODE_DISABLE_MODELS_FETCH: "1"
});

export interface OpencodeRunnerDeps {
  readonly process?: AgentProcess;
  /** The program to start. Default `opencode`. */
  readonly binary?: string;
  /** A fresh directory for the run's config. */
  readonly makeTempDir?: () => Promise<string>;
  /**
   * Map the config directory to the path the process sees. The Docker isolation mounts the
   * directory read-only into the container; OpenCode only reads it.
   */
  readonly configDirPath?: (dir: string) => string;
}

export const createOpencodeRunner = (deps: OpencodeRunnerDeps = {}): AgentRunner => {
  const spawnProcess = deps.process ?? createAgentProcess();
  const binary = deps.binary ?? "opencode";
  const makeTempDir =
    deps.makeTempDir ?? (() => mkdtemp(path.join(tmpdir(), "kaine-desk-opencode-")));

  return {
    run: async <T>(request: AgentRunRequest<T>): Promise<AgentRunOutcome<T>> => {
      const empty = { trace: [], sessionId: null, denials: [] } as const;
      const refuse = (message: string): AgentRunOutcome<T> => ({
        ok: false,
        failure: { kind: "process-error", message, exitCode: null, stderrTail: "" },
        partial: empty
      });
      if (request.provider !== "opencode") {
        return refuse(`The OpenCode runner cannot run a ${request.provider} request.`);
      }
      if (Buffer.byteLength(request.prompt, "utf8") > MAX_PROMPT_BYTES) {
        return refuse(
          `The prompt is larger than ${MAX_PROMPT_BYTES} bytes. Pass large content as a file path.`
        );
      }
      let args: string[];
      try {
        args = buildOpencodeArgs(request);
      } catch (error) {
        if (error instanceof OpencodePolicyError) return refuse(error.message);
        throw error;
      }

      const dir = await makeTempDir();
      try {
        const config = { permissions: toOpencodePermissions(request.permissions) };
        await writeFile(path.join(dir, "opencode.json"), `${JSON.stringify(config, null, 2)}\n`);

        const parser = createOpencodeStreamParser();
        const run = await spawnProcess({
          argv: [binary, ...args],
          cwd: request.cwd,
          env: opencodeEnv(request.cwd, deps.configDirPath?.(dir) ?? dir),
          timeoutMs: request.timeoutMs,
          signal: request.signal,
          onSpawn: request.onSpawn,
          onLine: (line) => {
            for (const event of parser.push(line)) request.onEvent?.(event);
          }
        });
        const summary = parser.finish();
        const partial = {
          trace: summary.events,
          sessionId: summary.sessionId,
          denials: summary.denials
        };

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
        if (summary.failure !== null || run.code !== 0) {
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
        if (!summary.completed || summary.lastMessage === null) {
          return {
            ok: false,
            failure: { kind: "no-result", message: "The stream ended before a final step_finish." },
            partial
          };
        }

        const resultText = summary.lastMessage;
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
            sessionId: summary.sessionId ?? "",
            usage: summary.usage,
            costUsd: summary.costUsd,
            turns: summary.turns,
            denials: summary.denials,
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
