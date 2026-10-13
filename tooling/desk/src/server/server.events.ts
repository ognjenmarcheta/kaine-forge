import type { IncomingMessage, ServerResponse } from "node:http";

import type { LogEntry, LogKind, ServerEvent } from "../contracts";
import type { PipelineEvent } from "../engine/pipeline.types";
import { describeLogRecord, toLogRecord } from "../log/log.record";
import type { Clock } from "../ports";

export type PipelineEventListener = (event: PipelineEvent) => void;

/** Where the server hears about the runner. The runner's `onEvent` feeds one of these. */
export interface PipelineEventSource {
  readonly subscribe: (listener: PipelineEventListener) => () => void;
}

export interface PipelineEventBus extends PipelineEventSource {
  readonly emit: PipelineEventListener;
}

/** A small fan-out. A throwing listener never reaches the emitter or the other listeners. */
export const createEventBus = (): PipelineEventBus => {
  const listeners = new Set<PipelineEventListener>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (event) => {
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch {
          // A broken listener must not break the pipeline.
        }
      }
    }
  };
};

// --- log buffer -----------------------------------------------------------

export interface LogBuffer {
  /** `null` when the event leaves no log line (a state change). */
  readonly append: (event: PipelineEvent) => LogEntry | null;
  /** Entries of one issue with `seq` above `after`, oldest first. */
  readonly read: (issueNumber: number, after: number) => { entries: LogEntry[]; last: number };
}

export const DEFAULT_LOG_CAPACITY = 500;

const KIND_OF_RECORD = { history: "history", agent: "agent", log: "log", note: "log" } as const;

/**
 * The newest entries of each issue, in memory. They are the live view: the
 * persistent record is `events.jsonl` (artifact `log`). Text passes the
 * shared redaction and bounds of the log records.
 */
export const createLogBuffer = (clock: Clock, capacity = DEFAULT_LOG_CAPACITY): LogBuffer => {
  const byIssue = new Map<number, LogEntry[]>();
  let seq = 0;

  return {
    append: (event) => {
      const record = toLogRecord(event, clock.now());
      if (record === null) return null;
      seq += 1;
      const kind: LogKind = KIND_OF_RECORD[record.kind];
      const entry: LogEntry = {
        seq,
        at: record.at,
        issueNumber: record.issue,
        kind,
        text: describeLogRecord(record)
      };
      const entries = byIssue.get(record.issue) ?? [];
      entries.push(entry);
      if (entries.length > capacity) entries.splice(0, entries.length - capacity);
      byIssue.set(record.issue, entries);
      return entry;
    },
    read: (issueNumber, after) => {
      const entries = byIssue.get(issueNumber) ?? [];
      return {
        entries: entries.filter((entry) => entry.seq > after),
        last: entries.at(-1)?.seq ?? 0
      };
    }
  };
};

// --- server-sent events ---------------------------------------------------

export interface SseHub {
  /** Take over `response` as an event stream. It ends when the client leaves or the hub closes. */
  readonly add: (request: IncomingMessage, response: ServerResponse) => void;
  readonly broadcast: (event: ServerEvent) => void;
  readonly clientCount: () => number;
  /** Called when the first client joins and when the last one leaves. */
  readonly onActivity: (listener: (active: boolean) => void) => void;
  readonly close: () => void;
}

export interface SseOptions {
  readonly heartbeatMs: number;
}

/**
 * Event stream fan-out. The heartbeat timer runs only while a client is
 * connected, so an idle server holds no timer.
 */
export const createSseHub = (options: SseOptions): SseHub => {
  const clients = new Set<ServerResponse>();
  let heartbeat: NodeJS.Timeout | null = null;
  let activity: (active: boolean) => void = () => undefined;

  const stopHeartbeat = (): void => {
    if (heartbeat !== null) clearInterval(heartbeat);
    heartbeat = null;
  };

  const drop = (response: ServerResponse): void => {
    if (!clients.delete(response)) return;
    if (clients.size === 0) {
      stopHeartbeat();
      activity(false);
    }
  };

  return {
    add: (request, response) => {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      response.write(": connected\n\n");
      clients.add(response);
      if (clients.size === 1) {
        heartbeat = setInterval(() => {
          for (const client of clients) client.write(": ping\n\n");
        }, options.heartbeatMs);
        activity(true);
      }
      const leave = (): void => drop(response);
      request.on("close", leave);
      response.on("close", leave);
    },
    broadcast: (event) => {
      const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
      for (const client of clients) client.write(frame);
    },
    clientCount: () => clients.size,
    onActivity: (listener) => {
      activity = listener;
    },
    close: () => {
      stopHeartbeat();
      for (const client of [...clients]) client.end();
      clients.clear();
    }
  };
};
