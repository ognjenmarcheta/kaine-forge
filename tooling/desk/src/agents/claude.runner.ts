import { randomUUID } from "node:crypto";

import { jsonFromText } from "./agent.json-value";
import { createAgentProcess, type AgentProcess } from "./agent.process";
import {
  MAX_PROMPT_BYTES,
  schemaIssues,
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRunner
} from "./agent.runner";
import { createClaudeStreamParser } from "./claude.stream";

export { createClaudeStreamParser, parseClaudeStream } from "./claude.stream";
export type { ClaudeFinal, ClaudeStreamParser, ClaudeStreamSummary } from "./claude.stream";

/**
 * Argument list for `claude -p`. The flags are the ones the Phase 2 spike
 * proved on claude 2.1.282:
 *
 * - `--permission-mode dontAsk --permission-prompts none`: a call that is not
 *   allowed is denied, never asked.
 * - `--setting-sources project`: the user's own settings and hooks stay out.
 *   `--bare` is not used: it skips hooks and `CLAUDE.md` and needs an API key.
 * - `--strict-mcp-config`: only the MCP config the engine passes.
 * - The prompt follows `-p` directly. `--allowedTools` and friends accept many
 *   values, so a prompt placed after them would be read as a tool rule.
 */
export const buildClaudeArgs = <T>(
  request: AgentRunRequest<T>,
  options: { readonly newSessionId: string }
): string[] => {
  const args = [
    "-p",
    request.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--setting-sources",
    "project",
    "--json-schema",
    JSON.stringify(request.outputSchema)
  ];
  if (request.settingsPath !== undefined) args.push("--settings", request.settingsPath);
  if (request.model !== undefined) args.push("--model", request.model);
  for (const rule of request.permissions.allow) args.push("--allowedTools", rule);
  for (const rule of request.permissions.disallow) args.push("--disallowedTools", rule);
  args.push("--strict-mcp-config");
  if (request.mcpConfigPath !== undefined) args.push("--mcp-config", request.mcpConfigPath);
  if (request.resumeSessionId === undefined) {
    args.push("--session-id", options.newSessionId);
  } else {
    args.push("--resume", request.resumeSessionId);
  }
  if (request.skillMode === "invoke" && request.skills.length > 0) {
    // The agent definition preloads the skill text. The prompt still tells the
    // agent to call the Skill tool, because the desk checks for that call.
    const name = `desk-${request.role}`;
    args.push(
      "--agents",
      JSON.stringify({
        [name]: {
          description: `Agent Desk ${request.role}`,
          prompt: `You are the Agent Desk ${request.role}. Follow the user message and the desk rules appended to this prompt.`,
          skills: request.skills
        }
      }),
      "--agent",
      name
    );
  }
  if (request.systemAppend !== undefined) args.push("--append-system-prompt", request.systemAppend);
  return args;
};

export interface ClaudeRunnerDeps {
  readonly process?: AgentProcess;
  /** The program to start. Default `claude`. */
  readonly binary?: string;
  readonly newSessionId?: () => string;
}

export const createClaudeRunner = (deps: ClaudeRunnerDeps = {}): AgentRunner => {
  const spawnProcess = deps.process ?? createAgentProcess();
  const binary = deps.binary ?? "claude";
  const newSessionId = deps.newSessionId ?? randomUUID;

  return {
    run: async <T>(request: AgentRunRequest<T>): Promise<AgentRunOutcome<T>> => {
      const empty = { trace: [], sessionId: null, denials: [] } as const;
      if (request.provider !== "claude") {
        return {
          ok: false,
          failure: {
            kind: "process-error",
            message: `The Claude runner cannot run a ${request.provider} request.`,
            exitCode: null,
            stderrTail: ""
          },
          partial: empty
        };
      }
      if (Buffer.byteLength(request.prompt, "utf8") > MAX_PROMPT_BYTES) {
        return {
          ok: false,
          failure: {
            kind: "process-error",
            message: `The prompt is larger than ${MAX_PROMPT_BYTES} bytes. Pass large content as a file path.`,
            exitCode: null,
            stderrTail: ""
          },
          partial: empty
        };
      }

      const parser = createClaudeStreamParser();
      const run = await spawnProcess({
        argv: [binary, ...buildClaudeArgs(request, { newSessionId: newSessionId() })],
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
      const final = summary.final;
      if (final === null) {
        return {
          ok: false,
          failure:
            run.code === 0
              ? { kind: "no-result", message: "The stream ended without a result line." }
              : {
                  kind: "process-error",
                  message: `${binary} exited with code ${run.code} and no result line.`,
                  exitCode: run.code,
                  stderrTail: run.stderrTail
                },
          partial
        };
      }
      if (final.isError || final.subtype !== "success") {
        return {
          ok: false,
          failure: {
            kind: "process-error",
            message: `${binary} ended with ${final.subtype}: ${final.resultText || "no message"}`,
            exitCode: run.code,
            stderrTail: run.stderrTail
          },
          partial
        };
      }

      const candidate = final.structured ?? jsonFromText(final.resultText);
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
          usage: final.usage,
          costUsd: final.costUsd,
          denials: final.denials,
          trace: summary.events,
          resultText: final.resultText
        }
      };
    }
  };
};
