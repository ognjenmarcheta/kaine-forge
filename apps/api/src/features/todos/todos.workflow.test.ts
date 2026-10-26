import { describe, expect, it, vi } from "vitest";

import { createTodoWorkflow } from "./todos.workflow";

const scope = {
  organizationId: "org-1",
  user: {
    email: "user@example.com",
    emailVerified: false,
    twoFactorEnabled: false,
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
      deleteAttachmentObject: async () => undefined,
      deleteTodo: async () => false,
      deleteTodoAttachments: async () => [],
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
      noteId: null,
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
      deleteAttachmentObject: async () => undefined,
      deleteTodo: async () => false,
      deleteTodoAttachments: async () => [],
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
      deleteAttachmentObject: async () => undefined,
      deleteTodo: async () => false,
      deleteTodoAttachments: async () => [],
      publishTodoEvent,
      toggleTodo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed: () => undefined
    });

    await expect(workflow.toggleTodo(scope, "todo-1")).resolves.toEqual(toggledTodo);

    expect(toggleTodo).toHaveBeenCalledWith(scope, "todo-1");
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:toggled", toggledTodo);
  });

  it("soft-deletes Attachments, deletes the Todo, then deletes each Attachment object", async () => {
    const calls: string[] = [];
    const publishTodoEvent = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo: async () => todo,
      deleteAttachmentObject: async (object) => {
        calls.push(`object:${object.key}`);
      },
      deleteTodo: async () => {
        calls.push("todo");
        return true;
      },
      deleteTodoAttachments: async () => {
        calls.push("attachments");
        return [
          { bucket: "files", key: "org-1/todo/a.png" },
          { bucket: "files", key: "org-1/todo/b.pdf" }
        ];
      },
      publishTodoEvent,
      toggleTodo: async () => todo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed: () => undefined
    });

    await workflow.deleteTodo(scope, "todo-1");

    expect(calls).toEqual([
      "attachments",
      "todo",
      "object:org-1/todo/a.png",
      "object:org-1/todo/b.pdf"
    ]);
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:deleted", {
      id: "todo-1",
      organizationId: "org-1"
    });
  });

  it("answers and publishes the delete without waiting for object storage", async () => {
    const publishTodoEvent = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo: async () => todo,
      // A stalled object store: the delete never settles.
      deleteAttachmentObject: () => new Promise<void>(() => undefined),
      deleteTodo: async () => true,
      deleteTodoAttachments: async () => [{ bucket: "files", key: "org-1/todo/a.png" }],
      publishTodoEvent,
      toggleTodo: async () => todo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed: () => undefined
    });

    const outcome = await Promise.race([
      workflow.deleteTodo(scope, "todo-1"),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), 50))
    ]);

    expect(outcome).toBe(true);
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:deleted", {
      id: "todo-1",
      organizationId: "org-1"
    });
  });

  it("warns, keeps deleting objects, and still deletes the Todo when an object delete fails", async () => {
    const error = new Error("s3 unreachable");
    const deleted: string[] = [];
    const warnTodoAttachmentCleanupFailed = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo: async () => todo,
      deleteAttachmentObject: async (object) => {
        if (object.key === "org-1/todo/a.png") throw error;
        deleted.push(object.key);
      },
      deleteTodo: async () => true,
      deleteTodoAttachments: async () => [
        { bucket: "files", key: "org-1/todo/a.png" },
        { bucket: "files", key: "org-1/todo/b.pdf" }
      ],
      publishTodoEvent: () => undefined,
      toggleTodo: async () => todo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed
    });

    await expect(workflow.deleteTodo(scope, "todo-1")).resolves.toBe(true);

    await vi.waitFor(() => expect(deleted).toEqual(["org-1/todo/b.pdf"]));
    expect(warnTodoAttachmentCleanupFailed).toHaveBeenCalledWith({
      err: error,
      todoId: "todo-1"
    });
  });

  it("warns and still deletes the Todo when Attachment cleanup fails", async () => {
    const error = new Error("storage unavailable");
    const deleteTodo = vi.fn(async () => true);
    const warnTodoAttachmentCleanupFailed = vi.fn();
    const workflow = createTodoWorkflow({
      createTodo: async () => todo,
      deleteAttachmentObject: async () => undefined,
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
      deleteAttachmentObject: async () => undefined,
      deleteTodo: async () => false,
      deleteTodoAttachments: async () => [],
      publishTodoEvent,
      toggleTodo: async () => todo,
      updateTodo: async () => todo,
      warnTodoAttachmentCleanupFailed: () => undefined
    });

    await expect(workflow.deleteTodo(scope, "todo-1")).resolves.toBe(false);

    expect(publishTodoEvent).not.toHaveBeenCalled();
  });
});
