import { beforeEach, describe, expect, it, vi } from "vitest";

const { chain, mockDb } = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    returning: vi.fn(),
    set: vi.fn(),
    values: vi.fn(),
    onConflictDoNothing: vi.fn()
  };
  Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
  chain.returning.mockResolvedValue([]);

  const mockDb = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain)
  };

  return { chain, mockDb };
});

vi.mock("@repo/db", () => ({
  db: mockDb,
  todosTable: {
    id: "id",
    userId: "userId",
    organizationId: "orgId",
    createdAt: "createdAt",
    completed: "completed",
    noteId: "noteId"
  },
  notesTable: {
    id: "note.id",
    organizationId: "note.orgId"
  }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args.filter((arg) => arg !== undefined)),
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
  inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import {
  createTodo,
  deleteTodo,
  getTodoById,
  listTodosByNoteIds,
  listTodosByScope
} from "./todos.adapter";

describe("todos.adapter", () => {
  const scope = {
    membership: { id: "membership-1", role: "owner", userId: "user-1" },
    organizationId: "org-1",
    user: {
      email: "u1@example.com",
      emailVerified: false,
      twoFactorEnabled: false,
      id: "user-1",
      name: "User One"
    },
    userId: "user-1"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
    chain.returning.mockResolvedValue([]);
  });

  it("listTodosByScope filters by Organization only", async () => {
    await listTodosByScope(scope, { limit: 20, offset: 0 });

    expect(chain.where).toHaveBeenCalledWith([["orgId", "org-1"]]);
  });

  it("getTodoById scopes the point read to the Active Organization", async () => {
    await getTodoById(scope, "todo-1");
    expect(chain.where).toHaveBeenCalledWith([
      ["id", "todo-1"],
      ["orgId", "org-1"]
    ]);
  });

  it("deleteTodo calls db.delete and returns boolean", async () => {
    chain.returning.mockResolvedValueOnce([{ id: "todo-1" }]);
    const result = await deleteTodo(scope, "todo-1");
    expect(mockDb.delete).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("listTodosByNoteIds returns [] without querying for empty input", async () => {
    const result = await listTodosByNoteIds(scope, []);
    expect(result).toEqual([]);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("createTodo with a noteId owned by the organization returns the created todo", async () => {
    const todo = {
      id: "todo-1",
      title: "Test",
      description: null,
      completed: false,
      userId: "user-1",
      organizationId: "org-1",
      noteId: "note-1",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    chain.limit.mockReturnValueOnce([{ id: "note-1" }]);
    chain.returning.mockResolvedValueOnce([todo]);

    const result = await createTodo(scope, { title: "Test", description: null, noteId: "note-1" });
    expect(result).toEqual(todo);
  });

  it("createTodo rejects a noteId that is not in the organization", async () => {
    chain.limit.mockReturnValueOnce([]);

    await expect(
      createTodo(scope, { title: "Test", description: null, noteId: "other-org-note" })
    ).rejects.toThrow("note not found");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
