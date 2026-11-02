// Proves on a real Postgres that a pubsub event published on one API replica
// reaches the subscribers of another (issue #802). Each replica holds its own
// LISTEN connection, as two API processes on one database do.
//
// It runs only when SYNC_POSTGRES_URL names a Postgres it may create and drop
// databases on, as CI's e2e job does; elsewhere it is skipped:
//   SYNC_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
//     pnpm --filter @repo/api exec vitest run src/pubsub.replicas.test.ts
import { createPostgresTestDatabase, type PostgresTestDatabase } from "@repo/db/testing";
import { createLogger } from "@repo/logger";
import { createPubSub } from "graphql-yoga";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";

import {
  organizationSubscriptions,
  type NoteSubscriptionPayload,
  type PubSubEventMap
} from "./pubsub";
import { REPLICA_CHANNEL, ReplicaEventTarget, startReplicaEvents } from "./pubsub.replicas";

const adminUrl = process.env.SYNC_POSTGRES_URL;

// Longer than one NOTIFY payload, and not only ASCII.
const LONG_BODY = "Grüße, čvor 🙂 ".repeat(1_500);

function note(organizationId: string, body: string | null): NoteSubscriptionPayload {
  return {
    body,
    createdAt: new Date("2026-11-01T08:00:00.000Z"),
    id: `note-of-${organizationId}`,
    organizationId,
    title: "Shared",
    updatedAt: new Date("2026-11-02T09:30:00.000Z")
  };
}

function listeners(database: PostgresTestDatabase): Promise<number | undefined> {
  return database.pool
    .query<{ listeners: number }>(
      "SELECT count(*)::int AS listeners FROM pg_stat_activity WHERE datname = current_database() AND query = $1",
      [`LISTEN ${REPLICA_CHANNEL}`]
    )
    .then(({ rows }) => rows[0]?.listeners);
}

function startReplica(database: PostgresTestDatabase) {
  const target = new ReplicaEventTarget();
  const pubsub = createPubSub<PubSubEventMap>({ eventTarget: target });
  const stop = startReplicaEvents({
    target,
    pool: database.pool,
    logger: createLogger({ name: "pubsub-replicas-test", level: "silent" })
  });
  return { pubsub, stop };
}

describe.skipIf(!adminUrl)("pubsub events across API replicas on real Postgres", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    if (!adminUrl) return;
    database = await createPostgresTestDatabase(adminUrl);
  }, 60_000);

  afterAll(async () => {
    await database?.close();
  });

  it("streams an event published on one replica to the other's subscribers of its own Organization, once", async () => {
    const a = startReplica(database);
    const b = startReplica(database);
    onTestFinished(async () => {
      await Promise.all([a.stop(), b.stop()]);
    });
    await expect.poll(() => listeners(database)).toBe(2);

    const { noteUpdated } = organizationSubscriptions(["noteUpdated"]);
    if (!noteUpdated) throw new Error("no noteUpdated resolver");
    const streamOnB = noteUpdated.subscribe(
      undefined,
      {},
      { pubsub: b.pubsub, requireOrganizationScope: () => ({ organizationId: "org-1" }) }
    );
    const onB = streamOnB[Symbol.asyncIterator]();
    const onA = a.pubsub.subscribe("note:updated")[Symbol.asyncIterator]();
    onTestFinished(async () => {
      await Promise.all([onA.return?.(), onB.return?.()]);
    });

    // A repeater listens from its first next().
    const nextOnB = onB.next();
    const firstOnA = onA.next();
    a.pubsub.publish("note:updated", note("org-2", "Other Organization"));
    a.pubsub.publish("note:updated", note("org-1", LONG_BODY));
    await expect(nextOnB).resolves.toEqual({ done: false, value: note("org-1", LONG_BODY) });

    // Committed after A's events, so it reaches A after any echo of them would.
    b.pubsub.publish("note:updated", note("org-3", null));
    await expect(firstOnA).resolves.toEqual({
      done: false,
      value: note("org-2", "Other Organization")
    });
    await expect(onA.next()).resolves.toEqual({ done: false, value: note("org-1", LONG_BODY) });
    await expect(onA.next()).resolves.toEqual({ done: false, value: note("org-3", null) });
  });

  it("listens again after Postgres drops its connection", async () => {
    const a = startReplica(database);
    const b = startReplica(database);
    onTestFinished(async () => {
      await Promise.all([a.stop(), b.stop()]);
    });
    await expect.poll(() => listeners(database)).toBe(2);

    await database.pool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND query = $1",
      [`LISTEN ${REPLICA_CHANNEL}`]
    );
    await expect.poll(() => listeners(database)).toBe(0);
    await expect.poll(() => listeners(database), { timeout: 5_000 }).toBe(2);

    const onB = b.pubsub.subscribe("note:deleted")[Symbol.asyncIterator]();
    onTestFinished(async () => {
      await onB.return?.();
    });
    const nextOnB = onB.next();
    a.pubsub.publish("note:deleted", { id: "note-1", organizationId: "org-1" });
    await expect(nextOnB).resolves.toEqual({
      done: false,
      value: { id: "note-1", organizationId: "org-1" }
    });
  });
});
