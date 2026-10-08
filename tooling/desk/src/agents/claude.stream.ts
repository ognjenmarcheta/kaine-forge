import { z } from "zod";

import { jsonValueSchema, preview, type JsonValue } from "./agent.json-value";
import type { AgentDenial, AgentEvent, AgentUsage } from "./agent.runner";

/**
 * Parser for `claude -p --output-format stream-json --verbose`. One JSON
 * object per line. The parser reads only what the desk needs: the session, the
 * assistant's text and tool calls, tool results, permission denials and the
 * final `result` line. Lines it does not know are counted and skipped.
 */

const contentBlock = z.object({
  type: z.string(),
  text: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.record(z.string(), jsonValueSchema).optional(),
  tool_use_id: z.string().optional(),
  content: z
    .union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))])
    .optional(),
  is_error: z.boolean().optional()
});

const toolInput = z.record(z.string(), jsonValueSchema);

const streamLine = z.object({
  type: z.string(),
  subtype: z.string().optional(),
  session_id: z.string().optional(),
  message: z.object({ content: z.union([z.string(), z.array(contentBlock)]) }).optional(),
  // system/permission_denied
  tool_name: z.string().optional(),
  tool_use_id: z.string().optional(),
  // result
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: jsonValueSchema.optional(),
  total_cost_usd: z.number().optional(),
  permission_denials: z
    .array(
      z.object({
        tool_name: z.string(),
        tool_use_id: z.string().optional(),
        tool_input: toolInput.optional()
      })
    )
    .optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
      output_tokens: z.number().optional()
    })
    .optional()
});

export interface ClaudeFinal {
  /** `success`, or an error subtype such as `error_max_turns`. */
  readonly subtype: string;
  readonly isError: boolean;
  readonly resultText: string;
  /** The parsed object from `--json-schema`, when the CLI returned one. */
  readonly structured: JsonValue | undefined;
  readonly usage: AgentUsage;
  readonly costUsd?: number | undefined;
  readonly denials: readonly AgentDenial[];
}

export interface ClaudeStreamSummary {
  readonly events: readonly AgentEvent[];
  readonly sessionId: string | null;
  /** The `type: "result"` line. `null` when the stream ended without one. */
  readonly final: ClaudeFinal | null;
  readonly denials: readonly AgentDenial[];
  readonly ignoredLines: number;
}

const PATH_KEYS = ["file_path", "path", "notebook_path", "relative_path"] as const;

const stringField = (input: Record<string, JsonValue>, key: string): string | undefined => {
  const value = input[key];
  return typeof value === "string" && value !== "" ? value : undefined;
};

const pathsOf = (input: Record<string, JsonValue>): string[] =>
  PATH_KEYS.flatMap((key) => {
    const value = stringField(input, key);
    return value === undefined ? [] : [value];
  });

const blockText = (block: z.infer<typeof contentBlock>): string => {
  if (typeof block.content === "string") return block.content;
  return (block.content ?? []).map((part) => part.text ?? "").join("\n");
};

interface KnownCall {
  readonly tool: string;
  readonly command: string | undefined;
  readonly paths: readonly string[];
}

export interface ClaudeStreamParser {
  /** Feed one stdout line. Returns the events it produced. */
  readonly push: (line: string) => AgentEvent[];
  readonly finish: () => ClaudeStreamSummary;
}

export const createClaudeStreamParser = (): ClaudeStreamParser => {
  const events: AgentEvent[] = [];
  const calls = new Map<string, KnownCall>();
  const denials = new Map<string, AgentDenial>();
  let sessionId: string | null = null;
  let final: ClaudeFinal | null = null;
  let ignored = 0;

  const denialKey = (denial: AgentDenial): string =>
    denial.toolUseId ?? `${denial.tool}:${denial.command ?? denial.paths.join(",")}`;

  const addDenial = (denial: AgentDenial, out: AgentEvent[]) => {
    const key = denialKey(denial);
    const known = denials.has(key);
    denials.set(key, denial);
    if (!known) out.push({ type: "denial", denial });
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

    if (entry.session_id !== undefined && sessionId === null) {
      sessionId = entry.session_id;
      out.push({ type: "session", sessionId });
    }

    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content) {
        if (block.type === "text" && block.text !== undefined && block.text.trim() !== "") {
          out.push({ type: "text", text: block.text });
        } else if (
          block.type === "tool_use" &&
          block.id !== undefined &&
          block.name !== undefined &&
          // The CLI's own structured-output tool is not agent activity.
          block.name !== "StructuredOutput"
        ) {
          const input = block.input ?? {};
          const command = stringField(input, "command");
          const paths = pathsOf(input);
          calls.set(block.id, { tool: block.name, command, paths });
          out.push({
            type: "tool_call",
            id: block.id,
            tool: block.name,
            command,
            paths,
            skill: block.name === "Skill" ? stringField(input, "skill") : undefined
          });
        }
      }
    } else if (entry.type === "user" && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content) {
        if (block.type === "tool_result" && block.tool_use_id !== undefined) {
          if (!calls.has(block.tool_use_id)) continue;
          out.push({
            type: "tool_result",
            id: block.tool_use_id,
            isError: block.is_error === true,
            output: preview(blockText(block))
          });
        }
      }
    } else if (entry.type === "system" && entry.subtype === "permission_denied") {
      const known = entry.tool_use_id === undefined ? undefined : calls.get(entry.tool_use_id);
      addDenial(
        {
          tool: entry.tool_name ?? known?.tool ?? "unknown",
          toolUseId: entry.tool_use_id,
          command: known?.command,
          paths: known?.paths ?? []
        },
        out
      );
    } else if (entry.type === "result") {
      for (const item of entry.permission_denials ?? []) {
        const input = item.tool_input ?? {};
        addDenial(
          {
            tool: item.tool_name,
            toolUseId: item.tool_use_id,
            command: stringField(input, "command"),
            paths: pathsOf(input)
          },
          out
        );
      }
      final = {
        subtype: entry.subtype ?? "unknown",
        isError: entry.is_error === true,
        resultText: entry.result ?? "",
        structured: entry.structured_output,
        usage: {
          inputTokens: entry.usage?.input_tokens ?? 0,
          cachedInputTokens: entry.usage?.cache_read_input_tokens ?? 0,
          outputTokens: entry.usage?.output_tokens ?? 0
        },
        costUsd: entry.total_cost_usd,
        denials: [...denials.values()]
      };
    }

    events.push(...out);
    return out;
  };

  return {
    push,
    finish: () => ({
      events,
      sessionId,
      final,
      denials: [...denials.values()],
      ignoredLines: ignored
    })
  };
};

/** Parse a whole recorded stream. */
export const parseClaudeStream = (lines: Iterable<string>): ClaudeStreamSummary => {
  const parser = createClaudeStreamParser();
  for (const line of lines) {
    if (line.trim() !== "") parser.push(line);
  }
  return parser.finish();
};
