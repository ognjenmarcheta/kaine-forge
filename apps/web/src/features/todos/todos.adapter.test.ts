import type { Client } from "urql";
import { describe, expect, it, vi } from "vitest";

import { createTodo, deleteTodo, listTodos, toggleTodo, updateTodo } from "./todos.adapter";

function createClientMock() {
  const query = vi.fn();
  const mutation = vi.fn();

  const client = {
    mutation,
    query
  } as unknown as Client;

  return { client, mutation, query };
}

describe("todos.adapter", () => {
  it("supports list and full mutation flow", async () => {
    const { client, mutation, query } = createClientMock();

    query.mockReturnValue({
      toPromise: async () => ({
        data: {
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
        }
      })
    });

    mutation
      .mockReturnValueOnce({
        toPromise: async () => ({
          data: {
            createTodo: {
              completed: false,
              description: "created description",
              id: "todo-2",
              title: "created title"
            }
          }
        })
      })
      .mockReturnValueOnce({
        toPromise: async () => ({
          data: {
            updateTodo: {
              completed: true,
              description: null,
              id: "todo-2",
              title: "updated title"
            }
          }
        })
      })
      .mockReturnValueOnce({
        toPromise: async () => ({
          data: {
            toggleTodo: {
              completed: true,
              id: "todo-2"
            }
          }
        })
      })
      .mockReturnValueOnce({
        toPromise: async () => ({
          data: {
            deleteTodo: true
          }
        })
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

  it("throws when graphql returns an error", async () => {
    const { client, query } = createClientMock();

    query.mockReturnValue({
      toPromise: async () => ({
        data: undefined,
        error: new Error("network")
      })
    });

    await expect(listTodos(client, { limit: 5, offset: 0 })).rejects.toThrowError("network");
  });
});
