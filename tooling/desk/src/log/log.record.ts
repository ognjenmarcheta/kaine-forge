import { z } from "zod";

import type { AgentEvent } from "../agents/agent.runner";
import { agentStageRoleSchema, stageSchema } from "../contracts";
import { redactAndBound } from "./log.redact";
import type { PipelineEvent } from "../engine/pipeline.types";

/**
 * One line of `agent.log.jsonl`. A record holds only text that passed
 * `redact()`. The log, `desk logs`, and the live terminal output all read this
 * one shape, so a secret that the redaction misses cannot appear in one place
 * and not in another.
 */

/** Longest text field in a record. Command output and agent text are cut here. */
export const MAX_FIELD_CHARS = 4_000;
export const LOG_RECORD_VERSION = 1;

const timestamp = z.string().min(1);

const agentRecordSchema = z
  .object({
    v: z.literal(LOG_RECORD_VERSION),
    kind: z.literal("agent"),
    at: timestamp,
    issue: z.number().int().positive(),
    role: agentStageRoleSchema,
    type: z.enum(["session", "text", "tool_call", "tool_result", "denial", "error"]),
    tool: z.string().optional(),
    command: z.string().optional(),
    paths: z.array(z.string()).optional(),
    skill: z.string().optional(),
    text: z.string().optional(),
    isError: z.boolean().optional(),
    exitCode: z.number().int().nullable().optional()
  })
  .strict();

const historyRecordSchema = z
  .object({
    v: z.literal(LOG_RECORD_VERSION),
    kind: z.literal("history"),
    at: timestamp,
    issue: z.number().int().positive(),
    stage: stageSchema,
    event: z.string(),
    note: z.string().optional()
  })
  .strict();

const messageRecordSchema = z
  .object({
    v: z.literal(LOG_RECORD_VERSION),
    kind: z.enum(["log", "note"]),
    at: timestamp,
    issue: z.number().int().nonnegative(),
    message: z.string()
  })
  .strict();

export const logRecordSchema = z.discriminatedUnion("kind", [
  agentRecordSchema,
  historyRecordSchema,
  messageRecordSchema
]);
export type LogRecord = z.infer<typeof logRecordSchema>;

const bound = (text: string): string => redactAndBound(text, MAX_FIELD_CHARS);

type AgentRecord = z.infer<typeof agentRecordSchema>;
type AgentFields = Pick<AgentRecord, "type"> &
  Partial<Omit<AgentRecord, "v" | "kind" | "at" | "issue" | "role" | "type">>;

const agentFields = (event: AgentEvent): AgentFields => {
  switch (event.type) {
    case "session":
      // A session id is not a secret, and `desk resume` shows it from state anyway.
      return { type: "session", text: bound(event.sessionId) };
    case "text":
      return { type: "text", text: bound(event.text) };
    case "tool_call":
      return {
        type: "tool_call",
        tool: bound(event.tool),
        ...(event.command === undefined ? {} : { command: bound(event.command) }),
        paths: event.paths.map(bound),
        ...(event.skill === undefined ? {} : { skill: bound(event.skill) })
      };
    case "tool_result":
      return {
        type: "tool_result",
        isError: event.isError,
        ...(event.exitCode === undefined ? {} : { exitCode: event.exitCode }),
        text: bound(event.output)
      };
    case "denial":
      return {
        type: "denial",
        tool: bound(event.denial.tool),
        ...(event.denial.command === undefined ? {} : { command: bound(event.denial.command) }),
        paths: event.denial.paths.map(bound)
      };
    case "error":
      return { type: "error", text: bound(event.message) };
  }
};

/**
 * The record for an event, or `null` when the event is not logged (`state`
 * events repeat what `state.json` already holds). `now` stamps the events
 * that carry no time of their own.
 */
export const toLogRecord = (event: PipelineEvent, now: Date): LogRecord | null => {
  const at = now.toISOString();
  switch (event.type) {
    case "state":
      return null;
    case "history":
      return {
        v: LOG_RECORD_VERSION,
        kind: "history",
        at: event.event.at,
        issue: event.issue,
        stage: event.event.stage,
        event: bound(event.event.event),
        ...(event.event.note === undefined ? {} : { note: bound(event.event.note) })
      };
    case "log":
      return {
        v: LOG_RECORD_VERSION,
        kind: "log",
        at,
        issue: event.issue,
        message: bound(event.message)
      };
    case "agent":
      return agentRecordSchema.parse({
        v: LOG_RECORD_VERSION,
        kind: "agent",
        at,
        issue: event.issue,
        role: event.role,
        ...agentFields(event.event)
      });
  }
};

/** Parse one line of the log. A line that does not match is skipped by the caller. */
export const parseLogLine = (line: string): LogRecord | null => {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = logRecordSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
};

const clip = (text: string, limit: number): string => {
  const firstLine = text.split("\n", 1)[0] ?? "";
  return firstLine.length > limit ? `${firstLine.slice(0, limit)}...` : firstLine;
};

const clock = (iso: string): string => /T(\d\d:\d\d:\d\d)/.exec(iso)?.[1] ?? iso;

/** Which activity a live terminal shows: stage moves, tool calls, denials, errors. Text stays in the log. */
export const isLiveWorthy = (record: LogRecord): boolean => {
  if (record.kind !== "agent") return true;
  return (
    record.type === "tool_call" ||
    record.type === "denial" ||
    record.type === "error" ||
    (record.type === "tool_result" && record.isError === true)
  );
};

const describeAgentRecord = (record: AgentRecord): string => {
  const who = `[${record.role}]`;
  const target = record.skill ?? record.command ?? (record.paths ?? []).join(", ");
  const tail = target === "" ? "" : ` ${clip(target, 140)}`;
  switch (record.type) {
    case "session":
      return `${who} session ${record.text ?? ""}`;
    case "text":
      return `${who} says: ${clip(record.text ?? "", 200)}`;
    case "tool_call":
      return `${who} ${record.tool ?? "tool"}${tail}`;
    case "tool_result": {
      const exit =
        record.exitCode === undefined || record.exitCode === null
          ? ""
          : ` (exit ${record.exitCode})`;
      return `${who} ${record.isError === true ? "tool failed" : "tool ok"}${exit}: ${clip(record.text ?? "", 120)}`;
    }
    case "denial":
      return `${who} DENIED ${record.tool ?? "tool"}${tail}`;
    case "error":
      return `${who} error: ${clip(record.text ?? "", 200)}`;
  }
};

/**
 * One compact, human-readable line for a record, without its time. The server sends this
 * with `at` beside it, so a browser shows the time in the reader's own zone and language.
 */
export const describeLogRecord = (record: LogRecord): string => {
  switch (record.kind) {
    case "history":
      return `${record.stage}: ${record.event}${record.note === undefined ? "" : ` - ${clip(record.note, 160)}`}`;
    case "log":
    case "note":
      return clip(record.message, 200);
    case "agent":
      return describeAgentRecord(record);
  }
};

/** The line a terminal prints: the UTC time of the record, then its description. */
export const formatLogRecord = (record: LogRecord): string =>
  `${clock(record.at)} ${describeLogRecord(record)}`;
