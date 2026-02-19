import type { GraphQLClient } from "graphql-request";
import { describe, expect, it, vi } from "vitest";

import { createTodo, deleteTodo, listTodos, toggleTodo, updateTodo } from "./todos.adapter";

function createClientMock() {
  const request = vi.fn();

  const client = {
    request
  } as unknown as GraphQLClient;

  return { client, request };
}

describe("todos.adapter", () => {
  it("supports list and full mutation flow", async () => {
    const { client, request } = createClientMock();

    request
      .mockResolvedValueOnce({
        todos: [
          {
            completed: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            description: "todo description",
            id: "todo-1",
            title: "todo title",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        createTodo: {
          completed: false,
          description: "created description",
          id: "todo-2",
          title: "created title"
        }
      })
      .mockResolvedValueOnce({
        updateTodo: {
          completed: true,
          description: null,
          id: "todo-2",
          title: "updated title"
        }
      })
      .mockResolvedValueOnce({
        toggleTodo: {
          completed: true,
          id: "todo-2"
        }
      })
      .mockResolvedValueOnce({
        deleteTodo: true
      });

    const listed = await listTodos(client, { limit: 20, offset: 0 });
    expect(listed).toEqual([
      {
        completed: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        description: "todo description",
        id: "todo-1",
        title: "todo title",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    const created = await createTodo(client, {
      description: "created description",
      title: "created title"
    });
    expect(created).toEqual({
      completed: false,
      description: "created description",
      id: "todo-2",
      title: "created title"
    });

    const updated = await updateTodo(client, "todo-2", {
      completed: true,
      description: null,
      title: "updated title"
    });
    expect(updated).toEqual({
      completed: true,
      description: null,
      id: "todo-2",
      title: "updated title"
    });

    const toggled = await toggleTodo(client, "todo-2");
    expect(toggled).toEqual({
      completed: true,
      description: null,
      id: "todo-2",
      title: ""
    });

    const deleted = await deleteTodo(client, "todo-2");
    expect(deleted).toBe(true);
  });

  it("throws when graphql request fails", async () => {
    const { client, request } = createClientMock();

    request.mockRejectedValue(new Error("network"));

    await expect(listTodos(client, { limit: 5, offset: 0 })).rejects.toThrowError("network");
  });
});
