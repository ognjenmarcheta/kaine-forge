import { describe, expect, it, vi } from "vitest";

import {
  createTodoListQueryKey,
  createTodoClientWorkflow,
  formatAttachmentSize,
  toTodoCreatePayload,
  toTodoUpdatePayload
} from "./todo.workflow";

describe("todo workflow", () => {
  it("normalizes create payloads consistently across platform Adapters", () => {
    expect(
      toTodoCreatePayload({
        description: "  details  ",
        title: "  New Todo  "
      })
    ).toEqual({
      description: "details",
      title: "New Todo"
    });

    expect(
      toTodoCreatePayload({
        description: "   ",
        title: "  New Todo  "
      })
    ).toEqual({
      description: null,
      title: "New Todo"
    });
  });

  it("normalizes update payloads without dropping explicit empty descriptions", () => {
    expect(
      toTodoUpdatePayload(
        {
          description: "   ",
          title: "  Edited  "
        },
        {
          completed: true
        }
      )
    ).toEqual({
      completed: true,
      description: null,
      title: "Edited"
    });
  });

  it("formats attachment sizes with stable units", () => {
    expect(formatAttachmentSize(999)).toBe("999 B");
    expect(formatAttachmentSize(1536)).toBe("1.5 KB");
    expect(formatAttachmentSize(1024 * 1024 * 2)).toBe("2 MB");
  });

  it("builds Todo list query keys with Active Organization identity", () => {
    expect(
      createTodoListQueryKey({
        activeOrganizationId: "org-1",
        queryKey: ["GetTodos", { limit: 50 }]
      })
    ).toEqual(["GetTodos", { limit: 50 }, "org-1"]);
    expect(
      createTodoListQueryKey({
        activeOrganizationId: null,
        queryKey: ["GetTodos"]
      })
    ).toEqual(["GetTodos", "inactive"]);
  });

  it("runs Todo create workflow with Active Organization gating and invalidation", async () => {
    const createTodo = vi.fn(async () => ({
      id: "todo-1",
      completed: false,
      title: "New Todo"
    }));
    const invalidateTodos = vi.fn(async () => undefined);
    const workflow = createTodoClientWorkflow({
      createTodo,
      getActiveOrganizationId: () => "org-1",
      invalidateTodos
    });

    const result = await workflow.create({
      draft: {
        description: "  details  ",
        title: "  New Todo  "
      }
    });

    expect(createTodo).toHaveBeenCalledWith({
      description: "details",
      title: "New Todo"
    });
    expect(invalidateTodos).toHaveBeenCalledOnce();
    expect(result).toEqual({
      id: "todo-1",
      completed: false,
      title: "New Todo"
    });
  });

  it("skips Todo mutations without an Active Organization", async () => {
    const createTodo = vi.fn(async () => ({
      id: "todo-1"
    }));
    const workflow = createTodoClientWorkflow({
      createTodo,
      getActiveOrganizationId: () => null,
      invalidateTodos: async () => undefined
    });

    await expect(
      workflow.create({
        draft: {
          description: "",
          title: "New Todo"
        }
      })
    ).rejects.toThrowError("active organization required");
    expect(createTodo).not.toHaveBeenCalled();
  });

  it("keeps missing Todo mutation Adapters explicit", async () => {
    const workflow = createTodoClientWorkflow({
      getActiveOrganizationId: () => "org-1",
      invalidateTodos: async () => undefined
    });

    await expect(
      workflow.create({
        draft: {
          description: "",
          title: "New Todo"
        }
      })
    ).rejects.toThrowError("create Todo adapter required");
    await expect(workflow.delete({ id: "todo-1" })).rejects.toThrowError(
      "delete Todo adapter required"
    );
    await expect(workflow.toggle({ id: "todo-1" })).rejects.toThrowError(
      "toggle Todo adapter required"
    );
    await expect(
      workflow.update({
        current: { completed: false },
        draft: {
          description: "",
          title: "New Todo"
        },
        id: "todo-1"
      })
    ).rejects.toThrowError("update Todo adapter required");
  });

  it("runs every Todo mutation through the shared Active Organization invalidation rule", async () => {
    const deleteTodo = vi.fn(async () => true);
    const toggleTodo = vi.fn(async () => ({ id: "todo-1", completed: true }));
    const updateTodo = vi.fn(async () => ({ id: "todo-1", completed: false }));
    const invalidateTodos = vi.fn(async () => undefined);
    const workflow = createTodoClientWorkflow({
      deleteTodo,
      getActiveOrganizationId: () => "org-1",
      invalidateTodos,
      toggleTodo,
      updateTodo
    });

    await expect(workflow.delete({ id: "todo-1" })).resolves.toBe(true);
    await expect(workflow.toggle({ id: "todo-1" })).resolves.toEqual({
      id: "todo-1",
      completed: true
    });
    await expect(
      workflow.update({
        current: { completed: false },
        draft: { description: "  details  ", title: "  Edited  " },
        id: "todo-1"
      })
    ).resolves.toEqual({ id: "todo-1", completed: false });

    expect(deleteTodo).toHaveBeenCalledWith("todo-1");
    expect(toggleTodo).toHaveBeenCalledWith("todo-1");
    expect(updateTodo).toHaveBeenCalledWith("todo-1", {
      completed: false,
      description: "details",
      title: "Edited"
    });
    expect(invalidateTodos).toHaveBeenCalledTimes(3);
  });
});
