import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";

import type { PipelineEvent } from "../engine/pipeline.types";
import type { Clock } from "../ports";
import { LOG_RECORD_VERSION, toLogRecord, type LogRecord } from "./log.record";
import type { IssueStore } from "../store/store.issue";

export const AGENT_LOG_NAME = "agent.log.jsonl";
/** One older generation stays after a rotation. */
export const ROTATED_LOG_NAME = `${AGENT_LOG_NAME}.1`;
/** A log file stops at about this size, then rotates. */
export const DEFAULT_LOG_MAX_BYTES = 4 * 1024 * 1024;

export const agentLogPath = (store: IssueStore, issue: number): string =>
  path.join(store.issueDir(issue), AGENT_LOG_NAME);

export interface LogSink {
  /** Queue the event. Never throws and never blocks the pipeline. */
  readonly write: (event: PipelineEvent, now?: Date) => LogRecord | null;
  /** Wait until every queued write ended. */
  readonly flush: () => Promise<void>;
  /** The first write error, or `null`. A log failure is never fatal, so the caller warns. */
  readonly failure: () => string | null;
}

export interface LogSinkOptions {
  readonly store: IssueStore;
  readonly clock: Clock;
  readonly maxBytes?: number | undefined;
}

const fileSize = async (file: string): Promise<number> => {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
};

/**
 * Append events to `<issue dir>/agent.log.jsonl`, one redacted JSON record per
 * line. The file is bounded: when a write would pass `maxBytes`, the file
 * moves to `agent.log.jsonl.1` (replacing an older one) and the new file
 * starts with a `note` record that says so. Events with issue 0 (desk-wide
 * messages) have no file and are not written.
 */
export const createLogSink = (options: LogSinkOptions): LogSink => {
  const maxBytes = options.maxBytes ?? DEFAULT_LOG_MAX_BYTES;
  const sizes = new Map<number, number>();
  let chain: Promise<void> = Promise.resolve();
  let failure: string | null = null;

  const append = async (record: LogRecord): Promise<void> => {
    const file = agentLogPath(options.store, record.issue);
    const line = `${JSON.stringify(record)}\n`;
    const bytes = Buffer.byteLength(line);
    const size = sizes.get(record.issue) ?? (await fileSize(file));
    let written = size;
    await mkdir(path.dirname(file), { recursive: true });
    if (size > 0 && size + bytes > maxBytes) {
      await rename(file, path.join(path.dirname(file), ROTATED_LOG_NAME));
      const note: LogRecord = {
        v: LOG_RECORD_VERSION,
        kind: "note",
        at: record.at,
        issue: record.issue,
        message: `Log rotated at ${maxBytes} bytes. Older records are in ${ROTATED_LOG_NAME}; the one before that was dropped.`
      };
      const noteLine = `${JSON.stringify(note)}\n`;
      await appendFile(file, noteLine, "utf8");
      written = Buffer.byteLength(noteLine);
    }
    await appendFile(file, line, "utf8");
    sizes.set(record.issue, written + bytes);
  };

  return {
    write: (event, now = options.clock.now()) => {
      let record: LogRecord | null;
      try {
        record = toLogRecord(event, now);
      } catch (error) {
        failure ??= error instanceof Error ? error.message : "could not build a log record";
        return null;
      }
      if (record === null || record.issue === 0) return record;
      const next = record;
      chain = chain.then(() =>
        append(next).catch((error: unknown) => {
          failure ??= error instanceof Error ? error.message : "could not write the log";
        })
      );
      return record;
    },
    flush: () => chain,
    failure: () => failure
  };
};
