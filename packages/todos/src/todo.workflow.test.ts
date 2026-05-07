import { describe, expect, it, vi } from "vitest";

import {
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

  it("runs Todo create workflow with Active Organization gating and invalidation", async () => {
    const createTodo = vi.fn(async () => ({
      id: "todo-1",
      completed: false,
      title: "New Todo"
    }));
    const invalidateTodos = vi.fn(async () => undefined);
    const workflow = createTodoClientWorkflow({
      createTodo,
      invalidateTodos
    });

    const result = await workflow.create({
      activeOrganizationId: "org-1",
      draft: {
        description: "  details  ",
        title: "  New Todo  "
      }
    });

    expect(createTodo).toHaveBeenCalledWith({
      description: "details",
      title: "New Todo"
    });
    expect(invalidateTodos).toHaveBeenCalledWith("org-1");
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
      invalidateTodos: async () => undefined
    });

    await expect(
      workflow.create({
        activeOrganizationId: null,
        draft: {
          description: "",
          title: "New Todo"
        }
      })
    ).rejects.toThrowError("active organization required");
    expect(createTodo).not.toHaveBeenCalled();
  });
});
