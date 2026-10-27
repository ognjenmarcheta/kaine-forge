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
  // A stand-in: the mocked adapters only pass it through.
  const data = { stub: "scoped-data" };
  const ctx = {
    data,
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

    expect(result).toEqual({ items: [], pageInfo: { hasNextPage: false, endCursor: null } });
    expect(assistantAdapter.getConversationById).toHaveBeenCalledWith(data, "conversation-1");
    expect(assistantAdapter.listMessages).not.toHaveBeenCalled();
  });
});
