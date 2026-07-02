import { describe, expect, it, vi } from "vitest";

import { createTodoAiWorkflow } from "./todos.ai";

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

describe("createTodoAiWorkflow", () => {
  it("returns not configured without calling AI or creating todos", async () => {
    const generateTodoDrafts = vi.fn();
    const createTodo = vi.fn();
    const workflow = createTodoAiWorkflow({
      createTodo,
      generateTodoDrafts,
      isConfigured: () => false,
      maxGeneratedTodos: 3,
      publishTodoEvent: vi.fn()
    });

    await expect(workflow.generateTodos(scope, { prompt: "Plan launch tasks" })).resolves.toEqual({
      status: "AI_NOT_CONFIGURED",
      todos: []
    });

    expect(generateTodoDrafts).not.toHaveBeenCalled();
    expect(createTodo).not.toHaveBeenCalled();
  });

  it("creates normalized generated todos and publishes created events", async () => {
    const firstTodo = todo;
    const secondTodo = {
      ...todo,
      description: null,
      id: "todo-2",
      title: "Follow up"
    };
    const createTodo = vi.fn(async (_scope, input: { title: string }) =>
      input.title === "Follow up" ? secondTodo : firstTodo
    );
    const publishTodoEvent = vi.fn();
    const workflow = createTodoAiWorkflow({
      createTodo,
      generateTodoDrafts: vi.fn(async () => [
        {
          description: "  details  ",
          title: "  New Todo  "
        },
        {
          description: "   ",
          title: "  Follow up  "
        },
        {
          description: "Skipped by max",
          title: "Skipped"
        }
      ]),
      isConfigured: () => true,
      maxGeneratedTodos: 2,
      publishTodoEvent
    });

    await expect(
      workflow.generateTodos(scope, { prompt: "  Plan launch tasks  " })
    ).resolves.toEqual({
      status: "CREATED",
      todos: [firstTodo, secondTodo]
    });

    expect(createTodo).toHaveBeenNthCalledWith(1, scope, {
      description: "details",
      title: "New Todo"
    });
    expect(createTodo).toHaveBeenNthCalledWith(2, scope, {
      description: null,
      title: "Follow up"
    });
    expect(publishTodoEvent).toHaveBeenNthCalledWith(1, "todo:created", firstTodo);
    expect(publishTodoEvent).toHaveBeenNthCalledWith(2, "todo:created", secondTodo);
  });
});
