import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";

import type {
  AssistantToolAction,
  ConversationMessage,
  SendMessageInput,
  SendMessagePayload
} from "./assistant.type";
import { buildConversationTitle } from "./assistant.util";

export interface AssistantAiWorkflowAdapter {
  appendMessage: (
    scope: AuthenticatedOrganizationScope,
    input: {
      content: string;
      conversationId: string;
      role: "assistant" | "user";
      toolActions?: AssistantToolAction[] | null;
    }
  ) => Promise<unknown>;
  createConversation: (
    scope: AuthenticatedOrganizationScope,
    input: { title?: string | null }
  ) => Promise<{ id: string }>;
  getConversationById: (
    scope: AuthenticatedOrganizationScope,
    id: string
  ) => Promise<{ id: string } | null>;
  isConfigured: () => boolean;
  listMessages: (
    scope: AuthenticatedOrganizationScope,
    conversationId: string
  ) => Promise<ConversationMessage[]>;
  runAgent: (input: {
    conversationId: string;
    messages: ConversationMessage[];
    scope: AuthenticatedOrganizationScope;
  }) => Promise<{ reply: string; toolActions: AssistantToolAction[] }>;
  touchConversation: (scope: AuthenticatedOrganizationScope, id: string) => Promise<void>;
}

export function createAssistantAiWorkflow(adapter: AssistantAiWorkflowAdapter) {
  return {
    async sendMessage(
      scope: AuthenticatedOrganizationScope,
      input: SendMessageInput
    ): Promise<SendMessagePayload> {
      if (!adapter.isConfigured()) {
        return {
          conversationId: input.conversationId ?? "",
          reply: null,
          status: "AI_NOT_CONFIGURED",
          toolActions: []
        };
      }

      const message = input.message.trim();

      if (message.length === 0) {
        return {
          conversationId: input.conversationId ?? "",
          message: "MESSAGE_REQUIRED",
          reply: null,
          status: "FAILED",
          toolActions: []
        };
      }

      let conversationId: string;

      if (input.conversationId) {
        const existing = await adapter.getConversationById(scope, input.conversationId);

        if (!existing) {
          return {
            conversationId: input.conversationId,
            message: "CONVERSATION_NOT_FOUND",
            reply: null,
            status: "FAILED",
            toolActions: []
          };
        }

        conversationId = existing.id;
      } else {
        const created = await adapter.createConversation(scope, {
          title: buildConversationTitle(message)
        });
        conversationId = created.id;
      }

      await adapter.appendMessage(scope, { content: message, conversationId, role: "user" });

      try {
        const history = await adapter.listMessages(scope, conversationId);
        const { reply, toolActions } = await adapter.runAgent({
          conversationId,
          messages: history,
          scope
        });

        await adapter.appendMessage(scope, {
          content: reply,
          conversationId,
          role: "assistant",
          toolActions
        });
        await adapter.touchConversation(scope, conversationId);

        return {
          conversationId,
          reply,
          status: "REPLIED",
          toolActions
        };
      } catch {
        return {
          conversationId,
          message: "AI_GENERATION_FAILED",
          reply: null,
          status: "FAILED",
          toolActions: []
        };
      }
    }
  };
}
