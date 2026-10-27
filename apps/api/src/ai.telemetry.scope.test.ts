import type { ServerAuth } from "@repo/auth/auth.type";
import { resolveRolePermissions } from "@repo/auth/permissions";
import { createLogger } from "@repo/logger";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth/server", () => ({ createServerAuth: vi.fn() }));
vi.mock("@repo/db", () => ({ db: {} }));
vi.mock("./features/assistant/assistant.ai-runtime", () => ({
  createAssistantAiRuntime: vi.fn(() => ({ isConfigured: () => true, runAgent: vi.fn() }))
}));
vi.mock("./features/assistant/assistant.ai", () => ({
  createAssistantAiWorkflow: vi.fn(() => ({ sendMessage: vi.fn() }))
}));
vi.mock("./features/todos/todos.ai-runtime", () => ({
  createTodoAiRuntime: vi.fn(() => ({ isConfigured: () => true, generateTodoDrafts: vi.fn() }))
}));
vi.mock("./features/todos/todos.ai", () => ({
  createTodoAiWorkflow: vi.fn(() => ({ generateTodos: vi.fn() }))
}));

import type { ModelRunTelemetry } from "./ai.telemetry";
import { createContextFromHeaders } from "./context";
import { createAssistantAiRuntime } from "./features/assistant/assistant.ai-runtime";
import { assistantResolvers } from "./features/assistant/assistant.router";
import { createTodoAiRuntime } from "./features/todos/todos.ai-runtime";
import { todosResolvers } from "./features/todos/todos.router";

const auth = {
  getCurrentOrganizationByScope: vi.fn(async () => null),
  getOrganizationMembershipProof: vi.fn(async () => ({
    id: "membership-1",
    organizationId: "org-1",
    permissions: resolveRolePermissions("owner", []),
    role: "owner",
    userId: "user-1"
  })),
  getSessionFromHeaders: vi.fn(async () => ({
    activeOrganizationId: "org-1",
    expiresAt: "2026-01-01T00:00:00.000Z",
    user: {
      email: "user@example.com",
      emailVerified: true,
      id: "user-1",
      name: "User",
      twoFactorEnabled: false
    }
  })),
  listInvitationsByScope: vi.fn(async () => []),
  listOrganizationMembersByScope: vi.fn(async () => []),
  listOrganizationsByScope: vi.fn(async () => [])
} satisfies ServerAuth;

const telemetry: ModelRunTelemetry = {
  runId: "run-1",
  provider: "openai",
  model: "test-model",
  durationMs: 10,
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  steps: 1,
  toolCalls: 0,
  status: "success",
  failureCategory: null
};

const prompt = "synthetic prompt that must stay out of logs";

// Model-call telemetry is useful per Organization only if every line carries
// the scope. The routers log through ctx.logger, and createContextFromHeaders
// binds organizationId on it; this proves the two meet on the real path.
describe("model-call log lines", () => {
  it.each([
    {
      message: "assistant model call",
      send: async (ctx: Awaited<ReturnType<typeof createContextFromHeaders>>) => {
        await assistantResolvers.Mutation.sendMessage({}, { input: { message: prompt } }, ctx);
        return vi.mocked(createAssistantAiRuntime).mock.lastCall?.[0].recordModelCall;
      }
    },
    {
      message: "todo generation model call",
      send: async (ctx: Awaited<ReturnType<typeof createContextFromHeaders>>) => {
        await todosResolvers.Mutation.generateTodos({}, { input: { prompt } }, ctx);
        return vi.mocked(createTodoAiRuntime).mock.lastCall?.[0].recordModelCall;
      }
    }
  ])("writes $message through the request logger bound to the organization", async (row) => {
    const ctx = await createContextFromHeaders(
      { authorization: "Bearer session-token" },
      createLogger({ level: "silent", name: "telemetry-scope-test" }),
      auth
    );
    const info = vi.spyOn(ctx.logger, "info");

    const record = await row.send(ctx);
    if (!record) throw new Error("the router did not wire recordModelCall");
    record({ ...telemetry, conversationId: "conversation-1" });

    expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1" }), row.message);
    expect(ctx.logger.bindings()).toMatchObject({ organizationId: "org-1", userId: "user-1" });
    expect(JSON.stringify(info.mock.calls)).not.toContain(prompt);
  });
});
