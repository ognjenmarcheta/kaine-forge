import { createPubSub } from "graphql-yoga";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./todos.adapter", () => ({
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getTodoById: vi.fn(),
  listTodosByUserIdAndOrganizationId: vi.fn(),
  toggleTodo: vi.fn(),
  updateTodo: vi.fn()
}));

vi.mock("../storage/storage.adapter", () => ({
  deleteFilesByEntity: vi.fn(),
  listFiles: vi.fn()
}));

import * as todosAdapter from "./todos.adapter";
import { todosResolvers } from "./todos.router";
import type { PubSubEventMap } from "../../pubsub";

describe("todos.router", () => {
  const testPubsub = createPubSub<PubSubEventMap>();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated access", async () => {
    await expect(
      todosResolvers.Query.todos({}, {}, { activeOrganizationId: "org-1", user: null } as never)
    ).rejects.toThrowError("authentication required");
  });

  it("rejects access without active organization", async () => {
    await expect(
      todosResolvers.Query.todos({}, {}, {
        activeOrganizationId: null,
        user: { id: "user-1" }
      } as never)
    ).rejects.toThrowError("active organization required");
  });

  it("lists todos with clamped pagination for authenticated user", async () => {
    vi.mocked(todosAdapter.listTodosByUserIdAndOrganizationId).mockResolvedValue([]);

    await todosResolvers.Query.todos({}, { limit: 9_999, offset: -12 }, {
      activeOrganizationId: "org-1",
      user: { id: "user-1" }
    } as never);

    expect(todosAdapter.listTodosByUserIdAndOrganizationId).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      {
        limit: 100,
        offset: 0
      }
    );
  });

  it("creates todo using normalized input", async () => {
    vi.mocked(todosAdapter.createTodo).mockResolvedValue({
      completed: false,
      createdAt: new Date(),
      description: "new description",
      id: "todo-1",
      title: "New Todo",
      updatedAt: new Date(),
      organizationId: "org-1",
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
      { activeOrganizationId: "org-1", user: { id: "user-1" }, pubsub: testPubsub } as never
    );

    expect(todosAdapter.createTodo).toHaveBeenCalledWith("user-1", "org-1", {
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
      organizationId: "org-1",
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
      { activeOrganizationId: "org-1", user: { id: "user-1" }, pubsub: testPubsub } as never
    );

    expect(todosAdapter.updateTodo).toHaveBeenCalledWith("user-1", "org-1", "todo-1", {
      completed: true,
      description: null,
      title: "Edited title"
    });
  });
});
