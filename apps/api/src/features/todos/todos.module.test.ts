import { resolveRolePermissions } from "@repo/auth/permissions";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import {
  filesTable,
  notesTable,
  organizationsTable,
  todosTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { createLogger, type Logger } from "@repo/logger";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from "vitest";

import { countTodos, createTodos, type TodoAttachments, type Todos } from "./todos.module";
import { createScopedData, type ScopedData } from "../../context.data";
import type { PubSubEventMap } from "../../pubsub";
import { createBilling } from "../billing/billing.module";
import { createAttachments } from "../storage/attachment.module";
import { createMemoryObjectStore } from "../storage/attachment.store.memory";

let database: TestDatabase;
let data: ScopedData;
let scope: AuthenticatedOrganizationScope;
let foreignNoteId: string;
let events: [keyof PubSubEventMap, ...unknown[]][];
// A real logger, silenced, so the warn call shape is the one production uses.
let logger: Logger;
let warn: MockInstance<Logger["warn"]>;
let deleteObject: (object: { bucket: string; key: string }) => Promise<void>;

function todosWith(attachments?: TodoAttachments): Todos {
  return createTodos({
    attachments:
      attachments ??
      createAttachments({
        data,
        logger,
        recordAuditEvent: () => Promise.resolve(),
        // The real Attachment module; only the object delete is the test's to control.
        store: { ...createMemoryObjectStore(), delete: (ref) => deleteObject(ref) }
      }),
    data,
    logger,
    // Billing off: the 61 fixture Todos are past the free limit, and no limit applies.
    plan: createBilling({ data, provider: "none", usage: { todos: () => countTodos(data) } }),
    publish: (eventName, ...payload) => {
      events.push([eventName, ...payload]);
    }
  });
}

/** Todos of a new Organization on the free Plan that already has `existing` Todos. */
async function freePlanTodos(
  existing: number
): Promise<{ todos: Todos; total: () => Promise<number> }> {
  const { db } = database;
  const [organization] = await db
    .insert(organizationsTable)
    .values({ name: "Free", slug: `free-${crypto.randomUUID()}`, userId: scope.userId })
    .returning();
  if (!organization) throw new Error("failed to seed organization");
  await db.insert(todosTable).values(
    Array.from({ length: existing }, (_, index) => ({
      title: `Existing ${index + 1}`,
      organizationId: organization.id,
      userId: scope.userId
    }))
  );
  const freeData = createScopedData({
    db,
    requireOrganizationScope: () => ({ ...scope, organizationId: organization.id })
  });
  const todos = createTodos({
    attachments: { detach: () => Promise.resolve({ purge: () => Promise.resolve() }) },
    data: freeData,
    logger,
    // A provider is set and the Organization has no subscription: the free Plan.
    plan: createBilling({
      data: freeData,
      provider: "stripe",
      usage: { todos: () => countTodos(freeData) }
    }),
    publish: () => {}
  });
  return { todos, total: () => countTodos(freeData) };
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  const [user] = await db
    .insert(usersTable)
    .values({ email: "u@example.test", name: "User" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [own, foreign] = await db
    .insert(organizationsTable)
    .values([
      { name: "Own", slug: "own", userId: user.id },
      { name: "Foreign", slug: "foreign", userId: user.id }
    ])
    .returning();
  if (!own || !foreign) throw new Error("failed to seed organizations");
  const createdAt = new Date("2026-09-13T12:00:00Z");
  await db.insert(todosTable).values(
    Array.from({ length: 61 }, (_, index) => ({
      // Same timestamp for every row: order falls back to id, so it is stable.
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      title: index === 0 ? "Needle TITLE" : `Todo ${index + 1}`,
      description: index === 2 ? "Needle DESCRIPTION" : null,
      completed: index % 2 === 1,
      organizationId: own.id,
      userId: user.id,
      createdAt,
      updatedAt: createdAt
    }))
  );
  const [foreignNote] = await db
    .insert(notesTable)
    .values({ organizationId: foreign.id, title: "Foreign note", userId: user.id })
    .returning();
  if (!foreignNote) throw new Error("failed to seed note");
  foreignNoteId = foreignNote.id;

  scope = {
    membership: {
      id: "membership-1",
      permissions: resolveRolePermissions("owner", []),
      role: "owner",
      userId: user.id
    },
    organizationId: own.id,
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
  await database.close();
});

beforeEach(() => {
  events = [];
  logger = createLogger({ level: "silent", name: "todos-module-test" });
  warn = vi.spyOn(logger, "warn");
  deleteObject = async () => undefined;
});

async function seedAttachments(todoId: string, keys: string[]) {
  await database.db.insert(filesTable).values(
    keys.map((key) => ({
      bucket: "files",
      entityId: todoId,
      entityType: "todo" as const,
      key,
      mimeType: "image/png",
      organizationId: scope.organizationId,
      originalName: key,
      sizeBytes: 1,
      status: "uploaded" as const,
      uploadedBy: scope.userId
    }))
  );
}

describe("createTodos", () => {
  // First, before any case writes a Todo: the fixture's 61 rows alternate open
  // and completed, starting open.
  it("counts open and completed Todos separately", async () => {
    expect(await todosWith().counts()).toEqual({ open: 31, completed: 30 });
  });

  it("searches title and description before pagination, combined with the completed filter", async () => {
    const todos = todosWith();
    const titles = async (filters: { search?: string; completed?: boolean }) =>
      (await todos.list({ first: 50, ...filters })).items.map((todo) => todo.title);

    expect(await titles({ search: " nEeDlE " })).toEqual(["Todo 3", "Needle TITLE"]);
    expect(await titles({ search: "needle", completed: true })).toEqual([]);
    expect(await titles({ search: "needle", completed: false })).toHaveLength(2);
  });

  it("pages deterministically and clamps the requested page", async () => {
    const todos = todosWith();
    const first = await todos.list({ first: 50 });
    const second = await todos.list({ first: 50, after: first.pageInfo.endCursor });

    expect(first.items).toHaveLength(50);
    expect(first.pageInfo.hasNextPage).toBe(true);
    expect(second.items).toHaveLength(11);
    expect(second.pageInfo.hasNextPage).toBe(false);
    expect(new Set([...first.items, ...second.items].map((todo) => todo.id)).size).toBe(61);
    expect((await todos.list({ first: 500 })).items).toHaveLength(61);
  });

  it("creates a Todo from normalized input and publishes todo:created once", async () => {
    const todo = await todosWith().create({ title: "  Buy milk  ", description: "   " });

    expect(todo).toMatchObject({ title: "Buy milk", description: null, completed: false });
    expect(events).toEqual([["todo:created", todo]]);
  });

  it("rejects a blank title or a Note from another organization, and writes nothing", async () => {
    const todos = todosWith();
    const before = await database.db.select().from(todosTable);

    await expect(todos.create({ title: "   " })).rejects.toThrow("todo title is required");
    await expect(todos.create({ title: "Linked", noteId: foreignNoteId })).rejects.toThrow(
      "note not found"
    );
    expect(await database.db.select().from(todosTable)).toEqual(before);
    expect(events).toEqual([]);
  });

  it("updates with a normalized patch, toggles, and publishes one event for each", async () => {
    const todos = todosWith();
    const created = await todos.create({ title: "Draft" });
    events = [];

    const updated = await todos.update(created.id, { title: "  Final ", description: "  " });
    const toggled = await todos.toggle(created.id);

    expect(updated).toMatchObject({ title: "Final", description: null });
    expect(toggled.completed).toBe(!updated.completed);
    expect(events).toEqual([
      ["todo:updated", updated],
      ["todo:toggled", toggled]
    ]);
    await expect(todos.toggle("00000000-0000-4000-8000-00000000ffff")).rejects.toThrow(
      "todo not found"
    );
  });

  it("deletes the Todo and its Attachment rows, publishes, then purges each object", async () => {
    const todo = await todosWith().create({ title: "With files" });
    await seedAttachments(todo.id, ["a.png", "b.png"]);
    const purged: string[] = [];
    deleteObject = async ({ key }) => {
      purged.push(key);
    };
    events = [];

    await expect(todosWith().delete(todo.id)).resolves.toBe(true);

    expect(events).toEqual([
      ["todo:deleted", { id: todo.id, organizationId: scope.organizationId }]
    ]);
    expect(await todosWith().get(todo.id)).toBeNull();
    const rows = await database.db
      .select()
      .from(filesTable)
      .where(eq(filesTable.entityId, todo.id));
    expect(rows.map((row) => row.status)).toEqual(["deleted", "deleted"]);
    // Each image Attachment owns its object and its thumbnail.
    await vi.waitFor(() =>
      expect(purged.sort()).toEqual(["a.png", "a.png.thumb.webp", "b.png", "b.png.thumb.webp"])
    );
  });

  it("answers the delete without waiting for a stalled object store", async () => {
    const todo = await todosWith().create({ title: "Stalled store" });
    await seedAttachments(todo.id, ["stalled.png"]);
    deleteObject = () => new Promise<void>(() => undefined);

    const outcome = await Promise.race([
      todosWith().delete(todo.id),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), 500))
    ]);

    expect(outcome).toBe(true);
  });

  it("warns and keeps purging when one object delete fails", async () => {
    const todo = await todosWith().create({ title: "Failing store" });
    await seedAttachments(todo.id, ["bad.png", "good.png"]);
    const purged: string[] = [];
    deleteObject = async ({ key }) => {
      if (key === "bad.png") throw new Error("s3 unreachable");
      purged.push(key);
    };

    await expect(todosWith().delete(todo.id)).resolves.toBe(true);

    await vi.waitFor(() =>
      expect(purged.sort()).toEqual(["bad.png.thumb.webp", "good.png", "good.png.thumb.webp"])
    );
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    const [record, message] = warn.mock.calls[0] ?? [];
    expect(message).toBe("failed to clean up todo attachments");
    // Under an `error` key with a bounded field set, never `err`: pino's
    // default serializer would copy the whole error onto the record.
    expect(record).toEqual({
      error: { message: "s3 unreachable", name: "Error", stack: expect.any(String) },
      todoId: todo.id
    });
  });

  it("warns and still deletes the Todo when detaching its Attachments fails", async () => {
    const todo = await todosWith().create({ title: "Broken attachments" });

    const deleted = await todosWith({
      detach: async () => {
        throw new Error("storage unavailable");
      }
    }).delete(todo.id);

    expect(deleted).toBe(true);
    expect(await todosWith().get(todo.id)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ todoId: todo.id }),
      "failed to clean up todo attachments"
    );
  });

  it("publishes nothing when no Todo was deleted", async () => {
    await expect(todosWith().delete("00000000-0000-4000-8000-00000000ffff")).resolves.toBe(false);
    expect(events).toEqual([]);
  });

  it("lists the Todos of the given Notes in one call", async () => {
    const todos = todosWith();
    const [note] = await database.db
      .insert(notesTable)
      .values({ organizationId: scope.organizationId, title: "Checklist", userId: scope.userId })
      .returning();
    if (!note) throw new Error("failed to seed note");
    const linked = await todos.create({ title: "Linked", noteId: note.id });

    expect((await todos.listByNoteIds([note.id])).map((todo) => todo.id)).toEqual([linked.id]);
    expect(await todos.listByNoteIds([])).toEqual([]);
  });
});

describe("the free Plan's todo limit", () => {
  it("creates the 50th Todo and refuses the 51st with PLAN_LIMIT_REACHED", async () => {
    const { todos, total } = await freePlanTodos(49);

    await todos.create({ title: "Fiftieth" });
    const refused = todos.create({ title: "Fifty-first" });

    await expect(refused).rejects.toMatchObject({
      extensions: { code: "PLAN_LIMIT_REACHED", feature: "todos", limit: 50, requiredPlan: "pro" }
    });
    expect(await total()).toBe(50);
  });

  it("lets exactly one of two parallel creates take the last free slot", async () => {
    const { todos, total } = await freePlanTodos(49);

    const results = await Promise.allSettled([
      todos.create({ title: "First" }),
      todos.create({ title: "Second" })
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await total()).toBe(50);
  });
});
