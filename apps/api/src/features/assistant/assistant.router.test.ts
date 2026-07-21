import { createPubSub } from "graphql-yoga";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./assistant.adapter", () => ({
  appendMessage: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getConversationById: vi.fn(),
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  listRecentMessages: vi.fn(),
  touchConversation: vi.fn()
}));

vi.mock("./assistant.ai-runtime", () => ({
  createAssistantAiRuntime: vi.fn()
}));

import * as assistantAdapter from "./assistant.adapter";
import { assistantResolvers } from "./assistant.router";
import type { PubSubEventMap } from "../../pubsub";

describe("assistant.router", () => {
  const testPubsub = createPubSub<PubSubEventMap>();
  const authenticatedScope = {
    organizationId: "org-1",
    user: {
      email: "u1@example.com",
      id: "user-1",
      name: "User One"
    },
    userId: "user-1"
  };
  const ctx = {
    pubsub: testPubsub,
    requireOrganizationScope: () => authenticatedScope
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no messages when the conversation is not owned by the requesting user", async () => {
    vi.mocked(assistantAdapter.getConversationById).mockResolvedValue(null);

    const result = await assistantResolvers.Query.assistantMessages(
      {},
      { conversationId: "conversation-1" },
      ctx as never
    );

    expect(result).toEqual([]);
    expect(assistantAdapter.getConversationById).toHaveBeenCalledWith(
      authenticatedScope,
      "conversation-1"
    );
    expect(assistantAdapter.listMessages).not.toHaveBeenCalled();
  });

  it("lists messages with clamped pagination for an owned conversation", async () => {
    vi.mocked(assistantAdapter.getConversationById).mockResolvedValue({
      createdAt: new Date(),
      id: "conversation-1",
      organizationId: "org-1",
      title: null,
      updatedAt: new Date(),
      userId: "user-1"
    });
    vi.mocked(assistantAdapter.listMessages).mockResolvedValue([]);

    await assistantResolvers.Query.assistantMessages(
      {},
      { conversationId: "conversation-1", limit: 9_999, offset: -5 },
      ctx as never
    );

    expect(assistantAdapter.listMessages).toHaveBeenCalledWith(
      authenticatedScope,
      "conversation-1",
      { limit: 200, offset: 0 }
    );
  });
});
