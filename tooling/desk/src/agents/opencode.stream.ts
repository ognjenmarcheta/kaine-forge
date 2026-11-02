import { z } from "zod";

import { preview } from "./agent.json-value";
import type { AgentDenial, AgentEvent, AgentUsage } from "./agent.runner";

/**
 * Parser for `opencode run --format json` (OpenCode 2.2.5). One JSON object per line,
 * each with `type` and `sessionID`: `step_start`, `text`, `tool_use`, `step_finish`
 * and `error`. There is no result line: the answer is the text of the last
 * assistant message, and usage is the sum of every `step_finish`.
 *
 * A `tool_use` line arrives only when the tool finished. A call that a permission
 * rule refused ends with the error `Permission denied: <action>`.
 */

const toolState = z.object({
  status: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.string().optional(),
  error: z.string().optional()
});

const part = z.object({
  id: z.string().optional(),
  messageID: z.string().optional(),
  text: z.string().optional(),
  tool: z.string().optional(),
  state: toolState.optional(),
  reason: z.string().optional(),
  cost: z.number().optional(),
  tokens: z
    .object({
      input: z.number().optional(),
      output: z.number().optional(),
      reasoning: z.number().optional(),
      cache: z.object({ read: z.number().optional() }).optional()
    })
    .optional()
});

const streamLine = z.object({
  type: z.string(),
  sessionID: z.string().optional(),
  part: part.optional(),
  error: z.object({ type: z.string().optional(), message: z.string().optional() }).optional()
});

/** OpenCode tool names mapped to the names the desk checks (`EDIT_TOOLS`, `agent.verify`). */
const TOOL_NAMES: Readonly<Record<string, string>> = {
  shell: "Bash",
  bash: "Bash",
  read: "Read",
  edit: "Edit",
  write: "Write",
  patch: "FileChange",
  glob: "Glob",
  grep: "Grep",
  skill: "Skill",
  webfetch: "WebFetch",
  websearch: "WebSearch"
};

const PERMISSION_DENIED = /^Permission denied: /;

export interface OpencodeStreamSummary {
  readonly events: readonly AgentEvent[];
  readonly sessionId: string | null;
  /** The text of the last assistant message. */
  readonly lastMessage: string | null;
  readonly usage: AgentUsage;
  readonly costUsd: number;
  /** The number of `step_finish` lines. */
  readonly turns: number;
  /** True when the last `step_finish` has reason `stop`. */
  readonly completed: boolean;
  /** The message of an `error` line. */
  readonly failure: string | null;
  readonly denials: readonly AgentDenial[];
  readonly ignoredLines: number;
}

export interface OpencodeStreamParser {
  readonly push: (line: string) => AgentEvent[];
  readonly finish: () => OpencodeStreamSummary;
}

const stringField = (
  input: Record<string, unknown> | undefined,
  key: string
): string | undefined => {
  const value = input?.[key];
  return typeof value === "string" ? value : undefined;
};

export const createOpencodeStreamParser = (): OpencodeStreamParser => {
  const events: AgentEvent[] = [];
  const denials: AgentDenial[] = [];
  let sessionId: string | null = null;
  let lastMessageId: string | null = null;
  let lastMessage: string | null = null;
  let usage: AgentUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let turns = 0;
  let completed = false;
  let failure: string | null = null;
  let ignored = 0;

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

    if (sessionId === null && entry.sessionID !== undefined && entry.sessionID !== "") {
      sessionId = entry.sessionID;
      out.push({ type: "session", sessionId: entry.sessionID });
    }

    const current = entry.part;
    if (entry.type === "text" && current?.text !== undefined) {
      const messageId = current.messageID ?? null;
      // A message can arrive in several text parts; the answer is the last message whole.
      lastMessage =
        messageId !== null && messageId === lastMessageId
          ? `${lastMessage ?? ""}${current.text}`
          : current.text;
      lastMessageId = messageId;
      if (current.text.trim() !== "") out.push({ type: "text", text: current.text });
    } else if (entry.type === "tool_use" && current?.tool !== undefined && current.state) {
      const id = current.id ?? `call_${events.length + out.length}`;
      const tool = TOOL_NAMES[current.tool] ?? current.tool;
      const input = current.state.input;
      const command = stringField(input, "command");
      const filePath = stringField(input, "path");
      const skill =
        tool === "Skill" ? (stringField(input, "id") ?? stringField(input, "name")) : undefined;
      const paths = filePath === undefined ? [] : [filePath];
      out.push({ type: "tool_call", id, tool, command, paths, skill });
      const error = current.state.status === "error" ? (current.state.error ?? "") : undefined;
      out.push({
        type: "tool_result",
        id,
        isError: error !== undefined,
        output: preview(error ?? current.state.output ?? "")
      });
      if (error !== undefined && PERMISSION_DENIED.test(error)) {
        const denial: AgentDenial = { tool, toolUseId: id, command, paths };
        denials.push(denial);
        out.push({ type: "denial", denial });
      }
    } else if (entry.type === "step_finish" && current !== undefined) {
      turns += 1;
      completed = current.reason === "stop";
      costUsd += current.cost ?? 0;
      usage = {
        // OpenCode reports cache reads apart from `input`.
        inputTokens: usage.inputTokens + (current.tokens?.input ?? 0),
        cachedInputTokens: usage.cachedInputTokens + (current.tokens?.cache?.read ?? 0),
        outputTokens:
          usage.outputTokens + (current.tokens?.output ?? 0) + (current.tokens?.reasoning ?? 0)
      };
    } else if (entry.type === "error") {
      const message = entry.error?.message ?? "OpenCode reported an error.";
      failure ??= message;
      out.push({ type: "error", message });
    }

    events.push(...out);
    return out;
  };

  return {
    push,
    finish: () => ({
      events,
      sessionId,
      lastMessage,
      usage,
      costUsd,
      turns,
      completed,
      failure,
      denials,
      ignoredLines: ignored
    })
  };
};

export const parseOpencodeStream = (lines: Iterable<string>): OpencodeStreamSummary => {
  const parser = createOpencodeStreamParser();
  for (const line of lines) {
    if (line.trim() !== "") parser.push(line);
  }
  return parser.finish();
};
