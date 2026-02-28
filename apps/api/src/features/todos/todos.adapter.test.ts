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
    completed: "completed"
  }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import {
  createTodo,
  deleteTodo,
  getTodoById,
  listTodosByUserIdAndOrganizationId
} from "./todos.adapter";

describe("todos.adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
    chain.returning.mockResolvedValue([]);
  });

  it("listTodosByUserIdAndOrganizationId calls db.select with correct chain", async () => {
    await listTodosByUserIdAndOrganizationId("user-1", "org-1", { limit: 20, offset: 0 });
    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.from).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalled();
    expect(chain.orderBy).toHaveBeenCalled();
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(chain.offset).toHaveBeenCalledWith(0);
  });

  it("getTodoById calls db.select with limit 1", async () => {
    await getTodoById("user-1", "org-1", "todo-1");
    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("createTodo calls db.insert and returns created todo", async () => {
    const todo = {
      id: "todo-1",
      title: "Test",
      description: null,
      completed: false,
      userId: "user-1",
      organizationId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    chain.returning.mockResolvedValueOnce([todo]);

    const result = await createTodo("user-1", "org-1", { title: "Test", description: null });
    expect(mockDb.insert).toHaveBeenCalled();
    expect(result).toEqual(todo);
  });

  it("deleteTodo calls db.delete and returns boolean", async () => {
    chain.returning.mockResolvedValueOnce([{ id: "todo-1" }]);
    const result = await deleteTodo("user-1", "org-1", "todo-1");
    expect(mockDb.delete).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});
