import type { Logger } from "@repo/logger";
import { randomUUID } from "node:crypto";
import type { Notification, Pool, PoolClient } from "pg";
import { z } from "zod";

/** The Postgres channel every API replica sends and receives pubsub events on. */
export const REPLICA_CHANNEL = "api_pubsub";

// A NOTIFY payload must stay under 8000 bytes. A larger event (a long Note
// body) goes as several parts, all sent by one statement, so Postgres
// delivers them together.
const PART_LENGTH = 7_000;
const RECONNECT_MS = { first: 1_000, max: 30_000 };
// A socket that dies without a FIN (a dropped NAT entry) emits no error, so the
// listener checks its connection and drops it when the check does not answer.
const HEARTBEAT_MS = { every: 30_000, timeout: 10_000 };
const DATE_TAG = "$date";

type SendEvent = (type: string, detail: unknown) => void;

/**
 * The pubsub's event target. An event published here reaches this replica's
 * subscribers at once, as before, and is also handed to the connected sender
 * for the other replicas. An event from another replica reaches this
 * replica's subscribers only.
 */
export class ReplicaEventTarget extends EventTarget {
  #send: SendEvent | null = null;

  override dispatchEvent(event: Event): boolean {
    if (this.#send && event instanceof CustomEvent) this.#send(event.type, event.detail);
    return super.dispatchEvent(event);
  }

  /** Delivers an event from another replica to this replica's subscribers. */
  receive(type: string, detail: unknown): void {
    super.dispatchEvent(new CustomEvent(type, { detail }));
  }

  connect(send: SendEvent | null): void {
    this.#send = send;
  }
}

// Payloads hold Dates, which JSON turns into strings; the tag turns them back.
function encode(type: string, detail: unknown): string {
  const json = JSON.stringify(
    { type, detail },
    function replaceDate(this: Record<string, unknown>, key: string, value: unknown) {
      const raw = this[key];
      return raw instanceof Date ? { [DATE_TAG]: raw.toISOString() } : value;
    }
  );
  return Buffer.from(json).toString("base64");
}

const dateTag = z.strictObject({ [DATE_TAG]: z.iso.datetime() });
const eventMessage = z.object({ type: z.string(), detail: z.unknown() });

function decode(data: string): z.infer<typeof eventMessage> {
  const json: unknown = JSON.parse(
    Buffer.from(data, "base64").toString(),
    (_key, value: unknown) => {
      const tagged = dateTag.safeParse(value);
      return tagged.success ? new Date(tagged.data[DATE_TAG]) : value;
    }
  );
  return eventMessage.parse(json);
}

export interface ReplicaEventsDeps {
  target: ReplicaEventTarget;
  pool: Pool;
  logger: Pick<Logger, "info" | "warn">;
}

/**
 * Shares the pubsub's events with every API replica on the same Postgres
 * through LISTEN/NOTIFY (ADR 0018: no broker). It holds one pool connection
 * for LISTEN and reconnects with backoff when it drops. While it is down, a
 * replica sees only its own events, and clients still catch up on their pull
 * interval. Returns the stopper for shutdown.
 */
export function startReplicaEvents({
  target,
  pool,
  logger
}: ReplicaEventsDeps): () => Promise<void> {
  const origin = randomUUID();
  let sequence = 0;
  let pending: string[] = [];
  let flushing: Promise<void> | null = null;

  // One statement per batch, and one batch at a time, so other replicas
  // receive events in the order this one published them.
  const flush = async () => {
    while (pending.length > 0) {
      const batch = pending;
      pending = [];
      try {
        await pool.query("SELECT pg_notify($1, message) FROM unnest($2::text[]) AS message", [
          REPLICA_CHANNEL,
          batch
        ]);
      } catch (error) {
        logger.warn({ err: error }, "pubsub events not sent to the other API replicas");
      }
    }
    flushing = null;
  };

  target.connect((type, detail) => {
    let data: string;
    try {
      data = encode(type, detail);
    } catch (error) {
      // Local subscribers still get the event; only the other replicas miss it.
      logger.warn({ err: error, type }, "pubsub event not sent to the other API replicas");
      return;
    }
    const id = String((sequence += 1));
    const count = Math.ceil(data.length / PART_LENGTH);
    for (let index = 0; index < count; index += 1) {
      const part = data.slice(index * PART_LENGTH, (index + 1) * PART_LENGTH);
      pending.push(`${origin} ${id} ${index} ${count} ${part}`);
    }
    flushing ??= flush();
  });

  const parts = new Map<string, string[]>();

  const onNotification = ({ channel, payload }: Notification) => {
    if (channel !== REPLICA_CHANNEL || !payload) return;
    const [from, id, index, count, part] = payload.split(" ");
    // This replica's own events reached its subscribers when they were published.
    if (from === origin || part === undefined) return;
    const key = `${from} ${id}`;
    const received = parts.get(key) ?? [];
    received[Number(index)] = part;
    if (received.filter(Boolean).length < Number(count)) {
      parts.set(key, received);
      return;
    }
    parts.delete(key);
    try {
      const { type, detail } = decode(received.join(""));
      target.receive(type, detail);
    } catch (error) {
      logger.warn({ err: error }, "pubsub event from another API replica not read");
    }
  };

  let client: PoolClient | null = null;
  let timer: NodeJS.Timeout | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let delay = RECONNECT_MS.first;
  let stopped = false;

  const drop = (dropped: PoolClient, error?: Error) => {
    if (client !== dropped) return;
    client = null;
    clearInterval(heartbeat);
    parts.clear();
    dropped.release(error ?? true);
    if (stopped) return;
    logger.warn({ err: error }, "pubsub listener for other API replicas lost; reconnecting");
    timer = setTimeout(() => void listen(), delay);
    delay = Math.min(delay * 2, RECONNECT_MS.max);
  };

  const check = async (checked: PoolClient) => {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        checked.query("SELECT 1"),
        new Promise((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("pubsub listener connection did not answer")),
            HEARTBEAT_MS.timeout
          );
        })
      ]);
    } catch (error) {
      drop(checked, error instanceof Error ? error : undefined);
    } finally {
      clearTimeout(timeout);
    }
  };

  const listen = async () => {
    let next: PoolClient | null = null;
    try {
      next = await pool.connect();
      const connected = next;
      client = connected;
      connected.on("notification", onNotification);
      connected.on("error", (error) => drop(connected, error));
      connected.on("end", () => drop(connected));
      await connected.query(`LISTEN ${REPLICA_CHANNEL}`);
      if (stopped) return drop(connected);
      delay = RECONNECT_MS.first;
      heartbeat = setInterval(() => void check(connected), HEARTBEAT_MS.every);
      logger.info("listening for pubsub events from the other API replicas");
    } catch (error) {
      // A dropped connection may have scheduled its reconnect already; drop() runs once per client.
      if (next) return drop(next, error instanceof Error ? error : undefined);
      if (stopped) return;
      logger.warn({ err: error }, "pubsub listener for other API replicas not started; retrying");
      timer = setTimeout(() => void listen(), delay);
      delay = Math.min(delay * 2, RECONNECT_MS.max);
    }
  };

  void listen();

  return async () => {
    stopped = true;
    clearTimeout(timer);
    target.connect(null);
    if (client) drop(client);
    await flushing;
  };
}
