import { z } from "zod";

import { preview } from "./agent.json-value";
import type { AgentEvent, AgentUsage } from "./agent.runner";

/**
 * Parser for `codex exec --json` (codex-cli 0.147.0). One JSON object per line:
 * `thread.started`, `turn.started`, `item.started|updated|completed`,
 * `turn.completed` and `turn.failed`/`error`.
 *
 * Codex does not report a command that its sandbox blocked: the spike saw no
 * `command_execution` item for a refused `git commit` or `touch`. The trace
 * therefore shows what ran, not every attempt. The engine's check that HEAD
 * and the branch are unchanged is the real guard.
 */

const item = z.object({
  id: z.string().optional(),
  type: z.string(),
  text: z.string().optional(),
  message: z.string().optional(),
  command: z.string().optional(),
  aggregated_output: z.string().optional(),
  exit_code: z.number().nullable().optional(),
  status: z.string().optional(),
  changes: z.array(z.object({ path: z.string(), kind: z.string().optional() })).optional(),
  server: z.string().optional(),
  tool: z.string().optional()
});

const streamLine = z.object({
  type: z.string(),
  thread_id: z.string().optional(),
  item: item.optional(),
  message: z.string().optional(),
  error: z.object({ message: z.string().optional() }).optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      cached_input_tokens: z.number().optional(),
      output_tokens: z.number().optional()
    })
    .optional()
});

export interface CodexStreamSummary {
  readonly events: readonly AgentEvent[];
  readonly threadId: string | null;
  /** The last `agent_message`. With `--output-schema` it holds the answer as JSON text. */
  readonly lastMessage: string | null;
  readonly usage: AgentUsage;
  /** True after `turn.completed`. */
  readonly completed: boolean;
  /** The message of `turn.failed` or a top-level `error`. */
  readonly failure: string | null;
  readonly ignoredLines: number;
}

const WRAPPER = /^(?:\/\S*\/)?(?:ba|z|da)?sh\s+-l?c\s+(['"])([\s\S]*)\1$/;

/**
 * Codex runs `/bin/zsh -lc '<command>'`. Return the inner command so prefix
 * checks see `git commit …`, not the wrapper. Other commands stay as they are.
 */
export const unwrapShellCommand = (command: string): string => {
  const match = WRAPPER.exec(command.trim());
  if (match === null) return command;
  const inner = match[2] ?? command;
  return match[1] === '"' ? inner.replace(/\\(["\\$`])/g, "$1") : inner.replace(/'\\''/g, "'");
};

export interface CodexStreamParser {
  readonly push: (line: string) => AgentEvent[];
  readonly finish: () => CodexStreamSummary;
}

export const createCodexStreamParser = (): CodexStreamParser => {
  const events: AgentEvent[] = [];
  const called = new Set<string>();
  let threadId: string | null = null;
  let lastMessage: string | null = null;
  let usage: AgentUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  let completed = false;
  let failure: string | null = null;
  let ignored = 0;

  const callEvent = (id: string, entry: z.infer<typeof item>): AgentEvent | null => {
    if (entry.type === "command_execution" && entry.command !== undefined) {
      return {
        type: "tool_call",
        id,
        tool: "Bash",
        command: unwrapShellCommand(entry.command),
        paths: []
      };
    }
    if (entry.type === "file_change") {
      return {
        type: "tool_call",
        id,
        tool: "FileChange",
        paths: (entry.changes ?? []).map((change) => change.path)
      };
    }
    if (entry.type === "mcp_tool_call" && entry.server !== undefined && entry.tool !== undefined) {
      return { type: "tool_call", id, tool: `mcp__${entry.server}__${entry.tool}`, paths: [] };
    }
    return null;
  };

  const push = (line: string): AgentEvent[] => {
    const out: AgentEvent[] = [];
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      ignored += 1;
      return out;
    }
    const parsed = streamLine.safeParse(json);
    if (!parsed.success) {
      ignored += 1;
      return out;
    }
    const entry = parsed.data;

    if (entry.type === "thread.started" && entry.thread_id !== undefined) {
      threadId = entry.thread_id;
      out.push({ type: "session", sessionId: entry.thread_id });
    } else if (
      (entry.type === "item.started" || entry.type === "item.completed") &&
      entry.item !== undefined
    ) {
      const current = entry.item;
      const id = current.id ?? `item_${events.length + out.length}`;
      if (current.type === "agent_message" && entry.type === "item.completed") {
        const text = current.text ?? "";
        lastMessage = text;
        if (text.trim() !== "") out.push({ type: "text", text });
      } else if (current.type === "error" && entry.type === "item.completed") {
        out.push({ type: "error", message: current.message ?? "Codex reported an error." });
      } else {
        const call = called.has(id) ? null : callEvent(id, current);
        if (call !== null) {
          called.add(id);
          out.push(call);
        }
        if (entry.type === "item.completed" && called.has(id)) {
          const exitCode = current.exit_code;
          out.push({
            type: "tool_result",
            id,
            isError:
              current.type === "command_execution"
                ? exitCode !== undefined && exitCode !== null && exitCode !== 0
                : current.status === "failed",
            exitCode,
            output: preview(current.aggregated_output ?? "")
          });
        }
      }
    } else if (entry.type === "turn.completed") {
      completed = true;
      usage = {
        inputTokens: entry.usage?.input_tokens ?? 0,
        cachedInputTokens: entry.usage?.cached_input_tokens ?? 0,
        outputTokens: entry.usage?.output_tokens ?? 0
      };
    } else if (entry.type === "turn.failed") {
      failure = entry.error?.message ?? "The Codex turn failed.";
      out.push({ type: "error", message: failure });
    } else if (entry.type === "error") {
      failure ??= entry.message ?? "Codex reported an error.";
      out.push({ type: "error", message: entry.message ?? "Codex reported an error." });
    }

    events.push(...out);
    return out;
  };

  return {
    push,
    finish: () => ({
      events,
      threadId,
      lastMessage,
      usage,
      completed,
      failure,
      ignoredLines: ignored
    })
  };
};

export const parseCodexStream = (lines: Iterable<string>): CodexStreamSummary => {
  const parser = createCodexStreamParser();
  for (const line of lines) {
    if (line.trim() !== "") parser.push(line);
  }
  return parser.finish();
};
