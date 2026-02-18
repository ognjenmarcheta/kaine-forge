import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./todos.adapter", () => ({
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getTodoById: vi.fn(),
  listTodosByUserId: vi.fn(),
  toggleTodo: vi.fn(),
  updateTodo: vi.fn()
}));

import * as todosAdapter from "./todos.adapter";
import { todosResolvers } from "./todos.router";

describe("todos.router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated access", async () => {
    await expect(todosResolvers.Query.todos({}, {}, { user: null } as never)).rejects.toThrowError(
      "authentication required"
    );
  });

  it("lists todos with clamped pagination for authenticated user", async () => {
    vi.mocked(todosAdapter.listTodosByUserId).mockResolvedValue([]);

    await todosResolvers.Query.todos({}, { limit: 9_999, offset: -12 }, {
      user: { id: "user-1" }
    } as never);

    expect(todosAdapter.listTodosByUserId).toHaveBeenCalledWith("user-1", {
      limit: 100,
      offset: 0
    });
  });

  it("creates todo using normalized input", async () => {
    vi.mocked(todosAdapter.createTodo).mockResolvedValue({
      completed: false,
      createdAt: new Date(),
      description: "new description",
      id: "todo-1",
      title: "New Todo",
      updatedAt: new Date(),
      userId: "user-1"
    });

    await todosResolvers.Mutation.createTodo(
      {},
      {
        input: {
          description: "  new description  ",
          title: "  New Todo  "
        }
      },
      { user: { id: "user-1" } } as never
    );

    expect(todosAdapter.createTodo).toHaveBeenCalledWith("user-1", {
      description: "new description",
      title: "New Todo"
    });
  });

  it("updates todo with filtered patch payload", async () => {
    vi.mocked(todosAdapter.updateTodo).mockResolvedValue({
      completed: true,
      createdAt: new Date(),
      description: null,
      id: "todo-1",
      title: "Edited title",
      updatedAt: new Date(),
      userId: "user-1"
    });

    await todosResolvers.Mutation.updateTodo(
      {},
      {
        id: "todo-1",
        input: {
          completed: true,
          description: "   ",
          title: "  Edited title  "
        }
      },
      { user: { id: "user-1" } } as never
    );

    expect(todosAdapter.updateTodo).toHaveBeenCalledWith("user-1", "todo-1", {
      completed: true,
      description: null,
      title: "Edited title"
    });
  });
});
