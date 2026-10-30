import { describe, expect, it, vi } from "vitest";

import { createTodoAiWorkflow } from "./todos.ai";

const todo = {
  completed: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  description: "details",
  id: "todo-1",
  noteId: null,
  organizationId: "org-1",
  syncVersion: 0,
  title: "New Todo",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  userId: "user-1"
};

describe("createTodoAiWorkflow", () => {
  it("returns not configured without calling AI or creating todos", async () => {
    const generateTodoDrafts = vi.fn();
    const createTodo = vi.fn();
    const workflow = createTodoAiWorkflow({
      createTodo,
      generateTodoDrafts,
      isConfigured: () => false,
      maxGeneratedTodos: 3,
      reportGenerationFailure: vi.fn()
    });

    await expect(workflow.generateTodos({ prompt: "Plan launch tasks" })).resolves.toEqual({
      status: "AI_NOT_CONFIGURED",
      todos: []
    });

    expect(generateTodoDrafts).not.toHaveBeenCalled();
    expect(createTodo).not.toHaveBeenCalled();
  });

  it("creates each generated draft through the Todo module, up to the maximum", async () => {
    const secondTodo = { ...todo, description: null, id: "todo-2", title: "Follow up" };
    // The Todo module's create normalizes and publishes; the workflow hands it
    // each draft as generated.
    const createTodo = vi.fn(async (input: { title: string }) =>
      input.title.includes("Follow up") ? secondTodo : todo
    );
    const drafts = [
      { description: "  details  ", title: "  New Todo  " },
      { description: "   ", title: "  Follow up  " },
      { description: "Skipped by max", title: "Skipped" }
    ];
    const workflow = createTodoAiWorkflow({
      createTodo,
      generateTodoDrafts: vi.fn(async () => drafts),
      isConfigured: () => true,
      maxGeneratedTodos: 2,
      reportGenerationFailure: vi.fn()
    });

    await expect(workflow.generateTodos({ prompt: "  Plan launch tasks  " })).resolves.toEqual({
      status: "CREATED",
      todos: [todo, secondTodo]
    });

    expect(createTodo.mock.calls).toEqual([[drafts[0]], [drafts[1]]]);
  });

  it("reports the failure instead of swallowing it when generation throws", () => {
    const reportGenerationFailure = vi.fn();
    const createTodo = vi.fn();
    const workflow = createTodoAiWorkflow({
      createTodo,
      generateTodoDrafts: vi.fn(async () => {
        throw new Error("provider refused");
      }),
      isConfigured: () => true,
      maxGeneratedTodos: 3,
      reportGenerationFailure
    });

    return expect(workflow.generateTodos({ prompt: "Plan launch" }))
      .resolves.toEqual({ message: "AI_GENERATION_FAILED", status: "FAILED", todos: [] })
      .then(() => {
        expect(reportGenerationFailure).toHaveBeenCalledWith({
          err: new Error("provider refused")
        });
        expect(createTodo).not.toHaveBeenCalled();
      });
  });
});
