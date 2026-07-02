import { describe, expect, it, vi } from "vitest";

import { createTodoWorkflow } from "./todos.workflow";

const scope = {
  organizationId: "org-1",
  user: {
    email: "user@example.com",
    emailVerified: false,
    id: "user-1",
    name: "User"
  },
  userId: "user-1"
};

const todo = {
  completed: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  description: "details",
  id: "todo-1",
  organizationId: "org-1",
  title: "New Todo",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  userId: "user-1"
};

describe("createTodoWorkflow", () => {
  it("creates a Todo with normalized input and publishes the created event", async () => {
    const createTodo = vi.fn(async () => todo);
    const publishTodoEvent = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo,
      deleteTodo: async () => false,
      deleteTodoAttachments: async () => undefined,
      publishTodoEvent,
      toggleTodo: async () => todo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed: () => undefined
    });

    await expect(
      workflow.createTodo(scope, {
        description: "  details  ",
        title: "  New Todo  "
      })
    ).resolves.toEqual(todo);

    expect(createTodo).toHaveBeenCalledWith(scope, {
      description: "details",
      title: "New Todo"
    });
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:created", todo);
  });

  it("updates a Todo with a filtered patch and publishes the updated event", async () => {
    const updateTodo = vi.fn(async () => ({
      ...todo,
      completed: true,
      description: null,
      title: "Edited title"
    }));
    const publishTodoEvent = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo: async () => todo,
      deleteTodo: async () => false,
      deleteTodoAttachments: async () => undefined,
      publishTodoEvent,
      toggleTodo: async () => todo,
      updateTodo,
      warnTodoAttachmentCleanupFailed: () => undefined
    });

    const result = await workflow.updateTodo(scope, "todo-1", {
      completed: true,
      description: "   ",
      title: "  Edited title  "
    });

    expect(updateTodo).toHaveBeenCalledWith(scope, "todo-1", {
      completed: true,
      description: null,
      title: "Edited title"
    });
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:updated", result);
  });

  it("toggles a Todo and publishes the toggled event", async () => {
    const toggledTodo = {
      ...todo,
      completed: true
    };
    const toggleTodo = vi.fn(async () => toggledTodo);
    const publishTodoEvent = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo: async () => todo,
      deleteTodo: async () => false,
      deleteTodoAttachments: async () => undefined,
      publishTodoEvent,
      toggleTodo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed: () => undefined
    });

    await expect(workflow.toggleTodo(scope, "todo-1")).resolves.toEqual(toggledTodo);

    expect(toggleTodo).toHaveBeenCalledWith(scope, "todo-1");
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:toggled", toggledTodo);
  });

  it("deletes Todo attachments before deleting the Todo", async () => {
    const calls: string[] = [];
    const publishTodoEvent = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo: async () => todo,
      deleteTodo: async () => {
        calls.push("todo");
        return true;
      },
      deleteTodoAttachments: vi.fn(async () => {
        calls.push("attachments");
      }),
      publishTodoEvent,
      toggleTodo: async () => todo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed: () => undefined
    });

    await workflow.deleteTodo(scope, "todo-1");

    expect(calls).toEqual(["attachments", "todo"]);
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:deleted", {
      id: "todo-1",
      organizationId: "org-1"
    });
  });

  it("warns and still deletes the Todo when Attachment cleanup fails", async () => {
    const error = new Error("storage unavailable");
    const deleteTodo = vi.fn(async () => true);
    const warnTodoAttachmentCleanupFailed = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo: async () => todo,
      deleteTodo,
      deleteTodoAttachments: async () => {
        throw error;
      },
      publishTodoEvent: () => undefined,
      toggleTodo: async () => todo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed
    });

    await expect(workflow.deleteTodo(scope, "todo-1")).resolves.toBe(true);

    expect(deleteTodo).toHaveBeenCalledWith(scope, "todo-1");
    expect(warnTodoAttachmentCleanupFailed).toHaveBeenCalledWith({
      err: error,
      todoId: "todo-1"
    });
  });

  it("does not publish a deleted event when the Todo was not deleted", async () => {
    const publishTodoEvent = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo: async () => todo,
      deleteTodo: async () => false,
      deleteTodoAttachments: async () => undefined,
      publishTodoEvent,
      toggleTodo: async () => todo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed: () => undefined
    });

    await expect(workflow.deleteTodo(scope, "todo-1")).resolves.toBe(false);

    expect(publishTodoEvent).not.toHaveBeenCalled();
  });
});
