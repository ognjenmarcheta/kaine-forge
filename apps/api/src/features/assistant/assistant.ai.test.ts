import { describe, expect, it, vi } from "vitest";

import { createAssistantAiWorkflow, type AssistantAiWorkflowAdapter } from "./assistant.ai";

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

function createAdapter(
  overrides: Partial<AssistantAiWorkflowAdapter> = {}
): AssistantAiWorkflowAdapter {
  return {
    appendMessage: vi.fn(async () => ({})),
    createConversation: vi.fn(async () => ({ id: "conv-1" })),
    getConversationById: vi.fn(async () => ({ id: "conv-1" })),
    isConfigured: () => true,
    listMessages: vi.fn(async () => [{ content: "Add buy milk", role: "user" as const }]),
    reportAgentFailure: vi.fn(),
    runAgent: vi.fn(async () => ({
      reply: "Created a todo to buy milk and marked it done.",
      toolActions: [
        { tool: "createTodo", input: { title: "buy milk" }, output: { id: "todo-1" } },
        { tool: "completeTodo", input: { id: "todo-1" }, output: { id: "todo-1", completed: true } }
      ]
    })),
    touchConversation: vi.fn(async () => undefined),
    ...overrides
  };
}

describe("createAssistantAiWorkflow", () => {
  it("returns not configured without touching the conversation or agent", async () => {
    const adapter = createAdapter({ isConfigured: () => false });
    const workflow = createAssistantAiWorkflow(adapter);

    await expect(workflow.sendMessage(scope, { message: "hi" })).resolves.toEqual({
      conversationId: "",
      reply: null,
      status: "AI_NOT_CONFIGURED",
      toolActions: []
    });

    expect(adapter.createConversation).not.toHaveBeenCalled();
    expect(adapter.runAgent).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async () => {
    const adapter = createAdapter();
    const workflow = createAssistantAiWorkflow(adapter);

    await expect(workflow.sendMessage(scope, { message: "   " })).resolves.toEqual({
      conversationId: "",
      message: "MESSAGE_REQUIRED",
      reply: null,
      status: "FAILED",
      toolActions: []
    });

    expect(adapter.runAgent).not.toHaveBeenCalled();
  });

  it("fails when a referenced conversation is not found", async () => {
    const adapter = createAdapter({ getConversationById: vi.fn(async () => null) });
    const workflow = createAssistantAiWorkflow(adapter);

    await expect(
      workflow.sendMessage(scope, { conversationId: "missing", message: "hi" })
    ).resolves.toEqual({
      conversationId: "missing",
      message: "CONVERSATION_NOT_FOUND",
      reply: null,
      status: "FAILED",
      toolActions: []
    });

    expect(adapter.runAgent).not.toHaveBeenCalled();
  });

  it("runs the agent, persists both turns, and returns the reply with tool actions", async () => {
    const adapter = createAdapter();
    const workflow = createAssistantAiWorkflow(adapter);

    const result = await workflow.sendMessage(scope, {
      message: "Create a todo to buy milk, then mark it done"
    });

    expect(result.status).toBe("REPLIED");
    expect(result.conversationId).toBe("conv-1");
    expect(result.reply).toBe("Created a todo to buy milk and marked it done.");
    expect(result.toolActions).toHaveLength(2);

    expect(adapter.appendMessage).toHaveBeenNthCalledWith(1, scope, {
      content: "Create a todo to buy milk, then mark it done",
      conversationId: "conv-1",
      role: "user"
    });
    expect(adapter.appendMessage).toHaveBeenNthCalledWith(2, scope, {
      content: "Created a todo to buy milk and marked it done.",
      conversationId: "conv-1",
      role: "assistant",
      toolActions: result.toolActions
    });
    expect(adapter.touchConversation).toHaveBeenCalledWith(scope, "conv-1");
  });

  it("returns FAILED when the agent throws, after persisting the user turn", async () => {
    const adapter = createAdapter({
      runAgent: vi.fn(async () => {
        throw new Error("model exploded");
      })
    });
    const workflow = createAssistantAiWorkflow(adapter);

    await expect(workflow.sendMessage(scope, { message: "hi" })).resolves.toEqual({
      conversationId: "conv-1",
      message: "AI_GENERATION_FAILED",
      reply: null,
      status: "FAILED",
      toolActions: []
    });

    expect(adapter.appendMessage).toHaveBeenCalledTimes(1);
    expect(adapter.touchConversation).not.toHaveBeenCalled();
    // The degraded payload above is unchanged; what was missing is any record
    // of why, so a failed assistant turn left nothing behind.
    expect(adapter.reportAgentFailure).toHaveBeenCalledTimes(1);
    expect(adapter.reportAgentFailure).toHaveBeenCalledWith({
      conversationId: "conv-1",
      err: new Error("model exploded")
    });
  });
});
