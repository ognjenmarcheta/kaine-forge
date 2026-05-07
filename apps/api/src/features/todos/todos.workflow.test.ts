import { describe, expect, it, vi } from "vitest";

import { createTodoWorkflow } from "./todos.workflow";

const scope = {
  organizationId: "org-1",
  user: {
    email: "user@example.com",
    id: "user-1",
    name: "User"
  },
  userId: "user-1"
};

describe("createTodoWorkflow", () => {
  it("deletes Todo attachments before deleting the Todo", async () => {
    const calls: string[] = [];
    const workflow = createTodoWorkflow({
      deleteTodo: async () => {
        calls.push("todo");
        return true;
      },
      deleteTodoAttachments: vi.fn(async () => {
        calls.push("attachments");
      })
    });

    await workflow.deleteTodo(scope, "todo-1");

    expect(calls).toEqual(["attachments", "todo"]);
  });
});
