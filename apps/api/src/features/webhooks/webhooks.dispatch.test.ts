// Proves that a write and its Webhook deliveries commit or roll back together:
// the real Todo module, the real dispatcher, and the real job queue, all on one
// PGlite database, so a delivery job is a row in the same transaction as the Todo.
import { PGlite } from "@electric-sql/pglite";
import { resolveRolePermissions } from "@repo/auth/permissions";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import {
  notesTable,
  organizationsTable,
  todosTable,
  usersTable,
  webhookEndpointsTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import {
  createJobQueue,
  JOB_DEFINITIONS,
  type AppJobs,
  type JobConnection,
  type JobQueue
} from "@repo/jobs";
import { createLogger } from "@repo/logger";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWebhookDispatcher } from "./webhooks.dispatch";
import { createScopedData, type ScopedData } from "../../context.data";
import { createNotes } from "../notes/notes.module";
import { createTodos, type Todos } from "../todos/todos.module";

let database: TestDatabase;
let queue: JobQueue<AppJobs>;
let data: ScopedData;
let endpointId: string;

// The queue's own connection to the PGlite instance: parameterized statements
// through query(), its multi-statement DDL through exec().
function pgliteConnection(client: PGlite): JobConnection {
  return {
    async executeSql(text, values) {
      if (values?.length) return client.query(text, values);
      const results = await client.exec(text);
      return { rows: results.flatMap((result) => result.rows) };
    }
  };
}

function todosOn(scoped: ScopedData, enqueue = storeDelivery): Todos {
  return createTodos({
    attachments: { detach: () => Promise.resolve({ purge: () => Promise.resolve() }) },
    data: scoped,
    logger: createLogger({ name: "webhooks-dispatch-test", level: "silent" }),
    // No Plan limit: the Todo module opens its own transaction for the insert.
    plan: { withinLimit: (_limit, _count, create) => create(scoped) },
    publish: () => undefined,
    recordEvent: createWebhookDispatcher({ enqueue })
  });
}

const storeDelivery: Parameters<typeof createWebhookDispatcher>[0]["enqueue"] = (
  delivery,
  connection
) => queue.enqueue("webhook.deliver", delivery, { connection });

/** The titles of the Todos whose `todo:created` deliveries the queue holds. */
async function deliveredTitles(): Promise<string[]> {
  const jobs = await database.client.query<{ title: string }>(
    "select data->'data'->>'title' as title from pgboss.job where name = 'webhook.deliver' order by created_on"
  );
  return jobs.rows.map((row) => row.title);
}

async function storedTitles(title: string): Promise<string[]> {
  const rows = await database.db
    .select({ title: todosTable.title })
    .from(todosTable)
    .where(eq(todosTable.title, title));
  return rows.map((row) => row.title);
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  queue = createJobQueue({
    backend: "pglite",
    db: pgliteConnection(database.client),
    definitions: JOB_DEFINITIONS,
    logger: createLogger({ name: "webhooks-dispatch-queue", level: "silent" }),
    stopTimeoutMs: 1000
  });
  await queue.start();

  const [user] = await db
    .insert(usersTable)
    .values({ email: "hooks@example.test", name: "Hooks" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [organization] = await db
    .insert(organizationsTable)
    .values({ name: "Hooks", slug: "hooks", userId: user.id })
    .returning();
  if (!organization) throw new Error("failed to seed organization");
  const [endpoint] = await db
    .insert(webhookEndpointsTable)
    .values({
      organizationId: organization.id,
      url: "https://hooks.example.com/in",
      secret: "whsec_hooks",
      eventTypes: ["todo:created", "note:created"]
    })
    .returning();
  if (!endpoint) throw new Error("failed to seed endpoint");
  endpointId = endpoint.id;

  const scope: AuthenticatedOrganizationScope = {
    membership: {
      id: "membership-1",
      permissions: resolveRolePermissions("owner", []),
      role: "owner",
      userId: user.id
    },
    organizationId: organization.id,
    user: {
      email: user.email,
      emailVerified: true,
      id: user.id,
      name: user.name,
      twoFactorEnabled: false
    },
    userId: user.id
  };
  data = createScopedData({ db, requireOrganizationScope: () => scope });
}, 30_000);

afterAll(async () => {
  await queue.stop();
  await database.close();
});

describe("webhook deliveries in the write's transaction", () => {
  it("stores one delivery per subscribed endpoint when the write commits", async () => {
    await todosOn(data).create({ title: "Committed" });

    const jobs = await database.client.query<{ endpointId: string; eventType: string }>(
      `select data->>'endpointId' as "endpointId", data->>'eventType' as "eventType"
       from pgboss.job where name = 'webhook.deliver' and data->'data'->>'title' = 'Committed'`
    );
    expect(jobs.rows).toEqual([{ endpointId, eventType: "todo:created" }]);
  });

  it("stores no delivery when the surrounding transaction rolls back", async () => {
    // A sync push applies its mutations in one transaction and can still fail after them.
    await expect(
      data.transaction(async (tx) => {
        await todosOn(tx).create({ title: "Rolled back" });
        throw new Error("push failed");
      })
    ).rejects.toThrow("push failed");

    expect(await storedTitles("Rolled back")).toEqual([]);
    expect(await deliveredTitles()).not.toContain("Rolled back");
  });

  it("fails the write, and keeps no Todo, when its delivery cannot be stored", async () => {
    const todos = todosOn(data, () => Promise.reject(new Error("queue unavailable")));

    await expect(todos.create({ title: "Undeliverable" })).rejects.toThrow("queue unavailable");
    expect(await storedTitles("Undeliverable")).toEqual([]);
  });

  it("fails a Note write the same way, and keeps no Note", async () => {
    const notes = createNotes({
      data,
      publish: () => undefined,
      recordEvent: createWebhookDispatcher({
        enqueue: () => Promise.reject(new Error("queue unavailable"))
      })
    });

    await expect(notes.create({ title: "Undeliverable note" })).rejects.toThrow(
      "queue unavailable"
    );
    const rows = await database.db
      .select({ id: notesTable.id })
      .from(notesTable)
      .where(eq(notesTable.title, "Undeliverable note"));
    expect(rows).toEqual([]);
  });
});
