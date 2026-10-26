import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { notesTable, organizationsTable, todosTable, usersTable } from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTodo, listTodosByScope } from "./todos.adapter";
import { createScopedData, type ScopedData } from "../../context.data";

let database: TestDatabase;
let data: ScopedData;
let foreignNoteId: string;

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

  const scope: AuthenticatedOrganizationScope = {
    membership: { id: "membership-1", role: "owner", userId: user.id },
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

describe("todos.adapter", () => {
  it("searches title and description before pagination, combined with the completed filter", async () => {
    const titles = async (filters: { search?: string; completed?: boolean }) =>
      (await listTodosByScope(data, { limit: 50 }, filters)).map((todo) => todo.title);

    expect(await titles({ search: " nEeDlE " })).toEqual(["Todo 3", "Needle TITLE"]);
    expect(await titles({ search: "needle", completed: true })).toEqual([]);
    expect(await titles({ search: "needle", completed: false })).toHaveLength(2);
  });

  it("pages deterministically and clamps the requested page", async () => {
    const first = await listTodosByScope(data, { limit: 50 });
    const second = await listTodosByScope(data, { limit: 50, offset: 50 });

    expect(first).toHaveLength(50);
    expect(second).toHaveLength(11);
    expect(new Set([...first, ...second].map((todo) => todo.id)).size).toBe(61);
    expect(await listTodosByScope(data, { limit: 500, offset: -5 })).toHaveLength(61);
  });

  it("rejects a Note from another organization and creates no Todo", async () => {
    const before = await database.db.select().from(todosTable);

    await expect(
      createTodo(data, { title: "Linked", description: null, noteId: foreignNoteId })
    ).rejects.toThrow("note not found");
    expect(await database.db.select().from(todosTable)).toEqual(before);
  });
});
