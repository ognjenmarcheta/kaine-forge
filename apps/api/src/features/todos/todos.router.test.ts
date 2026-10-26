import { drizzle } from "drizzle-orm/node-postgres";
import { createPubSub } from "graphql-yoga";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./todos.adapter", () => ({
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getTodoById: vi.fn(),
  toggleTodo: vi.fn(),
  updateTodo: vi.fn()
}));

vi.mock("../storage/storage.adapter", () => ({
  deleteFilesByEntity: vi.fn(),
  listFiles: vi.fn()
}));

import * as todosAdapter from "./todos.adapter";
import { todosResolvers } from "./todos.router";
import { createTodoWorkflow } from "./todos.workflow";
import { createScopedData } from "../../context.data";
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
  // Opaque here: the mocked adapters never query it.
  const data = createScopedData({
    db: drizzle.mock(),
    requireOrganizationScope: () => {
      throw new Error("unused");
    }
  });
  // A real workflow over the mocked adapters, matching what context.ts now
  // builds. The resolvers delegate to it, so the normalization assertions below
  // still reach todosAdapter and still mean what they meant before.
  const ctx = {
    pubsub: testPubsub,
    requireOrganizationScope: () => authenticatedScope,
    workflows: {
      todo: createTodoWorkflow({
        createTodo: (_scope, input) => todosAdapter.createTodo(data, input),
        deleteAttachmentObject: async () => undefined,
        deleteTodo: (_scope, id) => todosAdapter.deleteTodo(data, id),
        deleteTodoAttachments: vi.fn(async () => []),
        publishTodoEvent: (eventName, ...payload) => {
          testPubsub.publish(eventName, ...payload);
        },
        toggleTodo: (_scope, id) => todosAdapter.toggleTodo(data, id),
        updateTodo: (_scope, id, patch) => todosAdapter.updateTodo(data, id, patch),
        warnTodoAttachmentCleanupFailed: vi.fn()
      })
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(todosAdapter.createTodo).toHaveBeenCalledWith(data, {
      description: "new description",
      noteId: null,
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

    expect(todosAdapter.updateTodo).toHaveBeenCalledWith(data, "todo-1", {
      completed: true,
      description: null,
      title: "Edited title"
    });
  });
});
