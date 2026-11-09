import { resolveRolePermissions } from "@repo/auth/permissions";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import {
  notesTable,
  organizationSyncVersionsTable,
  organizationsTable,
  syncMutationReceiptsTable,
  todosTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { createLogger } from "@repo/logger";
import { eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSync, type Sync, type SyncModuleDeps } from "./sync.module";
import type { SyncMutationInput, SyncPullPayload } from "./sync.type";
import { createScopedData, type ScopedData } from "../../context.data";
import type { PubSubEventMap } from "../../pubsub";
import { createNotes } from "../notes/notes.module";
import { createTodos, type TodoModuleDeps } from "../todos/todos.module";

let database: TestDatabase;
let own: AuthenticatedOrganizationScope;
let other: AuthenticatedOrganizationScope;
let current: AuthenticatedOrganizationScope;
let events: [keyof PubSubEventMap, ...unknown[]][];

const logger = createLogger({ name: "sync-test", level: "silent" });

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
      email: `${userId}@example.test`,
      emailVerified: true,
      id: userId,
      name: "User",
      twoFactorEnabled: false
    },
    userId
  };
}

// An unlimited Plan, run on the savepoint's own data as context.ts wires it.
const unlimited = (data: ScopedData): TodoModuleDeps["plan"] => ({
  withinLimit: (_limit, _countUsed, create) => create(data)
});

const createWriters: SyncModuleDeps["createWriters"] = ({ data, publish, defer }) => ({
  todos: createTodos({
    attachments: { detach: async () => ({ purge: async () => defer(async () => undefined) }) },
    data,
    logger,
    plan: unlimited(data),
    publish,
    recordEvent: () => Promise.resolve()
  }),
  notes: createNotes({ data, publish, recordEvent: () => Promise.resolve() })
});

function syncWith(writers: SyncModuleDeps["createWriters"] = createWriters): Sync {
  const requireOrganizationScope = () => current;
  return createSync({
    db: database.db,
    data: createScopedData({ db: database.db, requireOrganizationScope }),
    requireOrganizationScope,
    publish: (eventName, ...payload) => {
      events.push([eventName, ...payload]);
    },
    createWriters: writers
  });
}

/** Pulls every page after `cursor`, as a client catching up would. */
async function pullAll(sync: Sync, cursor: string | null = null, first = 2) {
  const pages: SyncPullPayload[] = [];
  let next = cursor;
  for (;;) {
    const page = await sync.pull({ cursor: next, first });
    pages.push(page);
    next = page.cursor;
    if (!page.hasMore) break;
  }
  return {
    cursor: next,
    todos: pages.flatMap((page) => page.todos.map((todo) => todo.title)),
    notes: pages.flatMap((page) => page.notes.map((note) => note.title)),
    deleted: pages.flatMap((page) => page.deleted),
    pages: pages.length
  };
}

const id = () => crypto.randomUUID();

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  const [user] = await db
    .insert(usersTable)
    .values({ email: "sync@example.test", name: "Sync" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const organizations = await db
    .insert(organizationsTable)
    .values([
      { name: "Own", slug: "sync-own", userId: user.id },
      { name: "Other", slug: "sync-other", userId: user.id }
    ])
    .returning();
  const [ownOrganization, otherOrganization] = organizations;
  if (!ownOrganization || !otherOrganization) throw new Error("failed to seed organizations");
  own = scopeFor(user.id, ownOrganization.id);
  other = scopeFor(user.id, otherOrganization.id);
}, 30_000);

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(todosTable);
  await database.db.delete(notesTable);
  await database.db.delete(syncMutationReceiptsTable);
  events = [];
  current = own;
});

describe("sync pull", () => {
  it("pages every row of the Organization in change order, then only later changes", async () => {
    const sync = syncWith();
    const noteId = id();
    await sync.push({
      idempotencyKey: "seed",
      mutations: [
        { noteCreate: { id: noteId, title: "Plan" } },
        { todoCreate: { id: id(), title: "First", noteId } },
        { todoCreate: { id: id(), title: "Second" } }
      ]
    });
    current = other;
    await sync.push({
      idempotencyKey: "other",
      mutations: [{ todoCreate: { id: id(), title: "Foreign" } }]
    });
    current = own;

    const initial = await pullAll(sync);
    expect(initial).toMatchObject({ todos: ["First", "Second"], notes: ["Plan"], pages: 2 });

    const unchanged = await pullAll(sync, initial.cursor);
    expect(unchanged).toMatchObject({ todos: [], notes: [], deleted: [] });

    // Deleting the Note unlinks its Todo by cascade: the Todo comes back too.
    await sync.push({ idempotencyKey: "delete", mutations: [{ noteDelete: { id: noteId } }] });
    const after = await pullAll(sync, unchanged.cursor);
    expect(after).toMatchObject({
      todos: ["First"],
      notes: [],
      deleted: [{ entity: "NOTE", id: noteId }]
    });
  });

  it("refuses another Organization's cursor", async () => {
    const sync = syncWith();
    const { cursor } = await sync.pull({});
    current = other;

    await expect(sync.pull({ cursor })).rejects.toThrow("invalid cursor");
    await expect(sync.pull({ cursor: "not-a-cursor" })).rejects.toThrow("invalid cursor");
  });

  it("resets a client behind removed Tombstones or ahead of the server, not a new one", async () => {
    const sync = syncWith();
    await sync.push({
      idempotencyKey: "seed",
      mutations: [{ todoCreate: { id: id(), title: "Kept" } }]
    });
    const { cursor: stale } = await sync.pull({});
    await sync.push({
      idempotencyKey: "more",
      mutations: [{ todoCreate: { id: id(), title: "Later" } }]
    });
    const [state] = await database.db
      .select()
      .from(organizationSyncVersionsTable)
      .where(eq(organizationSyncVersionsTable.organizationId, own.organizationId));
    await database.db
      .update(organizationSyncVersionsTable)
      .set({ prunedThrough: state?.version ?? 0 })
      .where(eq(organizationSyncVersionsTable.organizationId, own.organizationId));

    await expect(sync.pull({ cursor: stale })).resolves.toMatchObject({
      resetRequired: true,
      cursor: null
    });
    // A first pull holds no row deleted before it started, so it is never reset.
    await expect(pullAll(sync, null, 1)).resolves.toMatchObject({
      todos: ["Kept", "Later"],
      pages: 2
    });

    const { cursor: current } = await sync.pull({});
    await database.db
      .update(organizationSyncVersionsTable)
      .set({ version: 1, prunedThrough: 0 })
      .where(eq(organizationSyncVersionsTable.organizationId, own.organizationId));
    await expect(sync.pull({ cursor: current })).resolves.toMatchObject({ resetRequired: true });
  });
});

describe("sync pull with a window", () => {
  /** Creates each Todo in its own push, so each gets its own creation time. */
  async function createTodos(sync: Sync, titles: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const title of titles) {
      const todoId = id();
      await sync.push({
        idempotencyKey: `create-${todoId}`,
        mutations: [{ todoCreate: { id: todoId, title } }]
      });
      ids.push(todoId);
    }
    return ids;
  }

  it("returns the newest rows first, loads the rest newest first, and still follows every change", async () => {
    const sync = syncWith();
    const [oldest, , middle] = await createTodos(sync, ["T1", "T2", "T3", "T4", "T5"]);
    await sync.push({
      idempotencyKey: "note",
      mutations: [{ noteCreate: { id: id(), title: "N1" } }]
    });

    const first = await sync.pull({ window: 2 });
    expect(first.todos.map((todo) => todo.title)).toEqual(["T5", "T4"]);
    expect(first.notes.map((note) => note.title)).toEqual(["N1"]);
    expect(first.older.map((older) => older.list)).toEqual(["todos"]);

    const titles: string[] = [];
    let older = first.older[0];
    while (older) {
      const page = await sync.pullOlder({ after: older.after, first: 2 });
      titles.push(...page.todos.map((todo) => todo.title));
      older = page.older[0];
    }
    expect(titles).toEqual(["T3", "T2", "T1"]);

    // A row outside the window still reaches the client when it changes.
    await sync.push({
      idempotencyKey: "later",
      mutations: [
        { todoUpdate: { id: oldest ?? "", title: "T1 edited" } },
        { todoDelete: { id: middle ?? "" } }
      ]
    });
    const later = await pullAll(sync, first.cursor);
    expect(later).toMatchObject({
      todos: ["T1 edited"],
      deleted: [{ entity: "TODO", id: middle }]
    });
  });

  it("refuses an older cursor of another Organization or of another list", async () => {
    const sync = syncWith();
    await createTodos(sync, ["T1", "T2"]);
    const [older] = (await sync.pull({ window: 1 })).older;
    const after = older?.after ?? "";

    const relabeled = Buffer.from(
      JSON.stringify([
        "sync-older",
        "notes",
        JSON.parse(Buffer.from(after, "base64url").toString())[2]
      ])
    ).toString("base64url");
    await expect(sync.pullOlder({ after: relabeled })).rejects.toThrow("invalid cursor");
    current = other;
    await expect(sync.pullOlder({ after })).rejects.toThrow("invalid cursor");
  });
});

describe("sync push", () => {
  it("applies an Outbox batch in order and publishes only after it commits", async () => {
    const sync = syncWith();
    const noteId = id();
    const todoId = id();

    const { results } = await sync.push({
      idempotencyKey: "batch",
      mutations: [
        { noteCreate: { id: noteId, title: "Trip", body: "Pack" } },
        { todoCreate: { id: todoId, title: "Tickets", description: "Book", noteId } },
        // Only the sent field changes: the description stays.
        { todoUpdate: { id: todoId, completed: true } },
        { noteUpdate: { id: noteId, body: null } }
      ]
    });

    expect(results).toEqual(Array(4).fill({ status: "APPLIED", code: null }));
    const [todo] = await database.db.select().from(todosTable).where(eq(todosTable.id, todoId));
    const [note] = await database.db.select().from(notesTable).where(eq(notesTable.id, noteId));
    expect(todo).toMatchObject({ title: "Tickets", description: "Book", completed: true, noteId });
    expect(note).toMatchObject({ title: "Trip", body: null });
    expect(events.map(([eventName]) => eventName)).toEqual([
      "note:created",
      "todo:created",
      "todo:updated",
      "note:updated"
    ]);
  });

  it("answers a repeated idempotency key with the first results and applies nothing", async () => {
    const sync = syncWith();
    const todoId = id();
    const push = {
      idempotencyKey: "retry",
      mutations: [
        { todoCreate: { id: todoId, title: "Once" } },
        { todoUpdate: { id: id(), title: "Missing" } }
      ]
    };

    const first = await sync.push(push);
    await database.db.update(todosTable).set({ title: "Edited" }).where(eq(todosTable.id, todoId));
    events = [];
    const second = await sync.push(push);

    expect(second).toEqual(first);
    expect(first.results.map((result) => result.code)).toEqual([null, "NOT_FOUND"]);
    const rows = await database.db.select({ title: todosTable.title }).from(todosTable);
    expect(rows).toEqual([{ title: "Edited" }]);
    expect(events).toEqual([]);
  });

  it("rejects what the modules refuse, rolls each back alone, and applies the rest", async () => {
    const sync = syncWith();
    const deletedId = id();
    const foreignId = id();
    current = other;
    await sync.push({
      idempotencyKey: "foreign",
      mutations: [{ todoCreate: { id: foreignId, title: "Foreign" } }]
    });
    current = {
      ...own,
      membership: {
        ...own.membership,
        permissions: own.membership.permissions.filter((p) => p !== "note:delete")
      }
    };
    await sync.push({
      idempotencyKey: "deleted",
      mutations: [
        { todoCreate: { id: deletedId, title: "Gone" } },
        { todoDelete: { id: deletedId } }
      ]
    });
    events = [];

    const mutations: SyncMutationInput[] = [
      { todoUpdate: { id: deletedId, title: "Too late" } },
      // Delete wins: a deleted id is never created again.
      { todoCreate: { id: deletedId, title: "Again" } },
      { todoCreate: { id: foreignId, title: "Collides" } },
      { todoCreate: { id: id(), title: "   " } },
      { todoCreate: { id: "not-a-uuid", title: "Bad id" } },
      { noteDelete: { id: id() } },
      { todoCreate: { id: id(), title: "Fine" } }
    ];
    const { results } = await sync.push({ idempotencyKey: "mixed", mutations });

    expect(results.map((result) => result.code)).toEqual([
      "NOT_FOUND",
      "NOT_FOUND",
      "CONFLICT",
      "INVALID",
      "INVALID",
      "FORBIDDEN",
      null
    ]);
    const [foreign] = await database.db
      .select({ title: todosTable.title, organizationId: todosTable.organizationId })
      .from(todosTable)
      .where(eq(todosTable.id, foreignId));
    expect(foreign).toEqual({ title: "Foreign", organizationId: other.organizationId });
    expect(events.map(([eventName]) => eventName)).toEqual(["todo:created"]);
  });

  it("rejects a create past the Plan's limit instead of failing the push", async () => {
    const sync = syncWith((input) => ({
      ...createWriters(input),
      todos: createTodos({
        attachments: { detach: async () => ({ purge: async () => undefined }) },
        data: input.data,
        logger,
        plan: {
          withinLimit: () => {
            throw new GraphQLError("the current plan allows at most 1 todos", {
              extensions: { code: "PLAN_LIMIT_REACHED" }
            });
          }
        },
        publish: input.publish,
        recordEvent: () => Promise.resolve()
      })
    }));

    const { results } = await sync.push({
      idempotencyKey: "limit",
      mutations: [
        { todoCreate: { id: id(), title: "Over the cap" } },
        { noteCreate: { id: id(), title: "Still fine" } }
      ]
    });

    expect(results).toEqual([
      { status: "REJECTED", code: "PLAN_LIMIT_REACHED" },
      { status: "APPLIED", code: null }
    ]);
  });

  it("rolls back the whole push and its receipt on an unexpected error, so a retry applies it", async () => {
    let failing = true;
    const sync = syncWith((input) => {
      const writers = createWriters(input);
      return {
        ...writers,
        notes: {
          ...writers.notes,
          create: async (note) => {
            if (failing) throw new Error("connection reset");
            return writers.notes.create(note);
          }
        }
      };
    });
    const push = {
      idempotencyKey: "flaky",
      mutations: [
        { todoCreate: { id: id(), title: "Before" } },
        { noteCreate: { id: id(), title: "Note" } }
      ]
    };

    await expect(sync.push(push)).rejects.toThrow("connection reset");
    expect(await database.db.select().from(todosTable)).toEqual([]);
    expect(events).toEqual([]);

    failing = false;
    await expect(sync.push(push)).resolves.toEqual({
      results: Array(2).fill({ status: "APPLIED", code: null })
    });
  });
});

describe("sync push of a Note body", () => {
  const BASE = "one\ntwo\nthree\nfour";

  async function noteWithBody(sync: Sync): Promise<string> {
    const noteId = id();
    await sync.push({
      idempotencyKey: `seed-${noteId}`,
      mutations: [{ noteCreate: { id: noteId, title: "Plan", body: BASE } }]
    });
    return noteId;
  }

  async function stored(noteId: string) {
    const [row] = await database.db
      .select({ title: notesTable.title, body: notesTable.body })
      .from(notesTable)
      .where(eq(notesTable.id, noteId));
    return row;
  }

  function edit(noteId: string, key: string, fields: { title?: string; body?: string }) {
    return {
      idempotencyKey: key,
      mutations: [
        { noteUpdate: { id: noteId, ...fields, ...("body" in fields ? { baseBody: BASE } : {}) } }
      ]
    };
  }

  it("keeps two offline edits of different lines", async () => {
    const sync = syncWith();
    const noteId = await noteWithBody(sync);

    await sync.push(edit(noteId, "first", { body: "ONE\ntwo\nthree\nfour" }));
    const second = await sync.push(edit(noteId, "second", { body: "one\ntwo\nthree\nFOUR" }));

    expect(second.results).toEqual([{ status: "APPLIED", code: null }]);
    expect(await stored(noteId)).toEqual({ title: "Plan", body: "ONE\ntwo\nthree\nFOUR" });
  });

  it("refuses a second edit of the same line with CONFLICT and keeps the first", async () => {
    const sync = syncWith();
    const noteId = await noteWithBody(sync);

    await sync.push(edit(noteId, "first", { body: "one\nTWO\nthree\nfour" }));
    const second = await sync.push(edit(noteId, "second", { body: "one\n2\nthree\nfour" }));

    expect(second.results).toEqual([{ status: "REJECTED", code: "CONFLICT" }]);
    expect(await stored(noteId)).toEqual({ title: "Plan", body: "one\nTWO\nthree\nfour" });
  });

  it("applies a title edit and a body edit of the same Note from two devices", async () => {
    const sync = syncWith();
    const noteId = await noteWithBody(sync);

    await sync.push(edit(noteId, "title", { title: "Renamed" }));
    await sync.push(edit(noteId, "body", { body: "one\ntwo\nthree\nfour\nfive" }));

    expect(await stored(noteId)).toEqual({
      title: "Renamed",
      body: "one\ntwo\nthree\nfour\nfive"
    });
  });

  it("merges a replayed push once", async () => {
    const sync = syncWith();
    const noteId = await noteWithBody(sync);
    const push = edit(noteId, "retry", { body: "zero\none\ntwo\nthree\nfour" });

    await sync.push(push);
    await sync.push(push);

    expect(await stored(noteId)).toEqual({ title: "Plan", body: "zero\none\ntwo\nthree\nfour" });
  });
});
