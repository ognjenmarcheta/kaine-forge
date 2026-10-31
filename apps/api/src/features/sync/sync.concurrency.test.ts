// Proves on a real Postgres what PGlite cannot: with writers committing
// concurrently and late, a sync pull that pages after a cursor never misses a
// change, and one Organization's writes never wait on another's (issue #803).
// The Sync Version trigger takes a row lock on the Organization's counter
// until commit (migration 0027), so a version is visible only once every
// lower version of that Organization has committed.
//
// It runs only when SYNC_POSTGRES_URL names a Postgres it may create and drop
// databases on, as CI's e2e job does; elsewhere it is skipped:
//   SYNC_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
//     pnpm --filter @repo/api exec vitest run src/features/sync/sync.concurrency.test.ts
import { resolveRolePermissions } from "@repo/auth/permissions";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { organizationsTable, usersTable } from "@repo/db/schema";
import {
  createPostgresTestDatabase,
  type PostgresTestClient,
  type PostgresTestDatabase
} from "@repo/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSync } from "./sync.module";
import { createScopedData } from "../../context.data";

const adminUrl = process.env.SYNC_POSTGRES_URL;

/** Ops each writer runs, and how many writers run at once in one Organization. */
const OPS = 40;
const WRITERS = 6;

function scopeFor(userId: string, organizationId: string): AuthenticatedOrganizationScope {
  return {
    membership: {
      id: `membership-${organizationId}`,
      permissions: resolveRolePermissions("owner", []),
      role: "owner",
      userId
    },
    organizationId,
    user: {
      email: "sync@example.test",
      emailVerified: true,
      id: userId,
      name: "Sync",
      twoFactorEnabled: false
    },
    userId
  };
}

/**
 * One writer: random creates, updates, and deletes of Todos and Notes, each in
 * its own transaction that sleeps before it commits, so commits land late and
 * out of version order whenever the trigger would allow it.
 */
async function write(
  client: PostgresTestClient,
  userId: string,
  organizationId: string
): Promise<void> {
  const mine: Array<{ table: "todos" | "notes"; id: string }> = [];
  for (let op = 0; op < OPS; op++) {
    const roll = Math.random();
    await client.query("BEGIN");
    if (mine.length === 0 || roll < 0.45) {
      const table = Math.random() < 0.5 ? "todos" : "notes";
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO ${table} (title, user_id, organization_id) VALUES ($1, $2, $3) RETURNING id`,
        [`row ${String(op)}`, userId, organizationId]
      );
      const id = rows[0]?.id;
      if (id) mine.push({ table, id });
    } else {
      const index = Math.floor(Math.random() * mine.length);
      const target = mine[index];
      if (target && roll < 0.8) {
        await client.query(`UPDATE ${target.table} SET title = $1 WHERE id = $2`, [
          `edit ${String(op)}`,
          target.id
        ]);
      } else if (target) {
        await client.query(`DELETE FROM ${target.table} WHERE id = $1`, [target.id]);
        mine.splice(index, 1);
      }
    }
    await client.query("SELECT pg_sleep($1)", [Math.random() * 0.005]);
    await client.query("COMMIT");
  }
}

describe.skipIf(!adminUrl)("sync versions on real Postgres", () => {
  let database: PostgresTestDatabase;
  let userId: string;
  let own: string;
  let other: string;

  beforeAll(async () => {
    if (!adminUrl) return;
    database = await createPostgresTestDatabase(adminUrl);
    const [user] = await database.db
      .insert(usersTable)
      .values({ email: "sync@example.test", name: "Sync" })
      .returning();
    if (!user) throw new Error("failed to seed user");
    const organizations = await database.db
      .insert(organizationsTable)
      .values([
        { name: "Own", slug: "own", userId: user.id },
        { name: "Other", slug: "other", userId: user.id }
      ])
      .returning();
    const [ownOrganization, otherOrganization] = organizations;
    if (!ownOrganization || !otherOrganization) throw new Error("failed to seed organizations");
    userId = user.id;
    own = ownOrganization.id;
    other = otherOrganization.id;
  }, 60_000);

  afterAll(async () => {
    await database?.close();
  });

  it("pulls every change exactly as committed while writers commit concurrently and late", async () => {
    const scope = scopeFor(userId, own);
    const requireOrganizationScope = () => scope;
    const sync = createSync({
      db: database.db,
      data: createScopedData({ db: database.db, requireOrganizationScope }),
      requireOrganizationScope,
      publish: () => undefined,
      createWriters: () => {
        throw new Error("this test only pulls");
      }
    });

    // What a client holds after pulling: each row's Sync Version, by entity and id.
    const local = new Map<string, number>();
    let cursor: string | null = null;
    async function drain() {
      for (;;) {
        const page = await sync.pull({ cursor, first: 7 });
        expect(page.resetRequired).toBe(false);
        for (const todo of page.todos) local.set(`TODO:${todo.id}`, todo.syncVersion);
        for (const note of page.notes) local.set(`NOTE:${note.id}`, note.syncVersion);
        for (const { entity, id } of page.deleted) local.delete(`${entity}:${id}`);
        cursor = page.cursor;
        if (!page.hasMore) return;
      }
    }

    const clients = await Promise.all(
      Array.from({ length: WRITERS + 2 }, () => database.pool.connect())
    );
    let writing = true;
    try {
      const writers = Promise.all([
        ...clients.slice(0, WRITERS).map((client) => write(client, userId, own)),
        // Noise in another Organization: none of it may reach this pull.
        ...clients.slice(WRITERS).map((client) => write(client, userId, other))
      ]).finally(() => {
        writing = false;
      });
      while (writing) {
        await drain();
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      await writers;
      await drain();
    } finally {
      for (const client of clients) client.release();
    }

    const { rows } = await database.pool.query<{ key: string; version: string }>(
      `SELECT 'TODO:' || id AS key, sync_version AS version FROM todos WHERE organization_id = $1
       UNION ALL
       SELECT 'NOTE:' || id, sync_version FROM notes WHERE organization_id = $1`,
      [own]
    );
    const committed = new Map(rows.map(({ key, version }) => [key, Number(version)]));
    expect(committed.size).toBeGreaterThan(0);
    expect(local).toEqual(committed);
  });

  it("serializes writers in one Organization and never makes another Organization wait", async () => {
    const holder = await database.pool.connect();
    const sameOrganization = await database.pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query(
        "INSERT INTO todos (title, user_id, organization_id) VALUES ('held', $1, $2)",
        [userId, own]
      );

      // Another Organization's write commits while the first transaction holds its lock.
      const started = Date.now();
      await database.pool.query(
        "INSERT INTO todos (title, user_id, organization_id) VALUES ('free', $1, $2)",
        [userId, other]
      );
      expect(Date.now() - started).toBeLessThan(1_000);

      // A second writer in the same Organization waits for the first to commit.
      let waited = true;
      const queued = sameOrganization
        .query("INSERT INTO todos (title, user_id, organization_id) VALUES ('queued', $1, $2)", [
          userId,
          own
        ])
        .then(() => {
          waited = false;
        });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(waited).toBe(true);

      await holder.query("COMMIT");
      await queued;
      expect(waited).toBe(false);
    } finally {
      holder.release();
      sameOrganization.release();
    }
  });
});
