import { SERVER_EVENT_TYPES, serverEventSchema, type ServerEvent } from "@repo/desk/contracts";

export type StreamStatus = "connecting" | "live" | "reconnecting";

/** The part of `EventSource` the client uses, so a test can supply its own. */
export interface EventSourceLike {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => void;
  close: () => void;
}

export interface StreamOptions {
  readonly url?: string;
  readonly createSource: (url: string) => EventSourceLike;
  readonly onEvent: (event: ServerEvent) => void;
  readonly onStatus: (status: StreamStatus) => void;
  /**
   * Called before each reconnect attempt and after each open. It reloads the
   * issue list, which closes any gap, and it tells the page when the session
   * is gone. Return `false` to stop reconnecting.
   */
  readonly onSync: () => Promise<boolean>;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
}

export interface EventStream {
  readonly close: () => void;
}

/** Delay before reconnect attempt `attempt` (0 for the first): exponential, capped. */
export const backoffDelay = (attempt: number, baseMs: number, maxMs: number): number =>
  Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));

/**
 * Connect to `GET /api/events`. A dropped stream reconnects with exponential
 * backoff. Before a reconnect and after each open the issue list loads again,
 * so an event missed in the gap is not lost.
 */
export function connectEventStream(options: StreamOptions): EventStream {
  const base = options.baseDelayMs ?? 1000;
  const max = options.maxDelayMs ?? 30_000;
  let source: EventSourceLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let closed = false;

  const sync = async (): Promise<boolean> => {
    try {
      return await options.onSync();
    } catch {
      return true;
    }
  };

  const open = (): void => {
    if (closed) return;
    const next = options.createSource(options.url ?? "/api/events");
    source = next;
    next.onopen = () => {
      if (closed || source !== next) return;
      attempt = 0;
      options.onStatus("live");
      void sync();
    };
    for (const type of SERVER_EVENT_TYPES) {
      next.addEventListener(type, (message) => {
        if (closed || source !== next) return;
        let data: unknown;
        try {
          data = JSON.parse(message.data);
        } catch {
          return;
        }
        const parsed = serverEventSchema.safeParse(data);
        if (parsed.success) options.onEvent(parsed.data);
      });
    }
    next.onerror = () => {
      if (closed || source !== next) return;
      next.close();
      source = null;
      options.onStatus("reconnecting");
      schedule();
    };
  };

  const schedule = (): void => {
    const delay = backoffDelay(attempt, base, max);
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      void sync().then((keepGoing) => {
        if (keepGoing) open();
      });
    }, delay);
  };

  options.onStatus("connecting");
  open();

  return {
    close: () => {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      source?.close();
      source = null;
    }
  };
}
