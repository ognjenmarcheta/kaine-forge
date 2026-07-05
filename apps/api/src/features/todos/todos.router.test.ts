import { createPubSub } from "graphql-yoga";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./todos.adapter", () => ({
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getTodoById: vi.fn(),
  listTodosByScope: vi.fn(),
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
  const session = {
    activeOrganizationId: "org-1",
    expiresAt: "2026-02-26T00:00:00.000Z",
    user: {
      email: "u1@example.com",
      id: "user-1",
      name: "User One"
    }
  };
  const authenticatedScope = {
    organizationId: "org-1",
    user: session.user,
    userId: "user-1"
  };
  const ctx = {
    pubsub: testPubsub,
    requireOrganizationScope: () => authenticatedScope
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists todos with clamped pagination for authenticated user", async () => {
    vi.mocked(todosAdapter.listTodosByScope).mockResolvedValue([]);

    await todosResolvers.Query.todos({}, { limit: 9_999, offset: -12 }, ctx as never);

    expect(todosAdapter.listTodosByScope).toHaveBeenCalledWith(authenticatedScope, {
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
      noteId: null,
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
      ctx as never
    );

    expect(todosAdapter.createTodo).toHaveBeenCalledWith(authenticatedScope, {
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
      noteId: null,
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
      ctx as never
    );

    expect(todosAdapter.updateTodo).toHaveBeenCalledWith(authenticatedScope, "todo-1", {
      completed: true,
      description: null,
      title: "Edited title"
    });
  });
});
