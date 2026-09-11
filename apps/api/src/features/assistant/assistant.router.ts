import { filter, pipe } from "graphql-yoga";

import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversationById,
  listConversations,
  listMessages,
  listRecentMessages,
  touchConversation
} from "./assistant.adapter";
import { createAssistantAiWorkflow } from "./assistant.ai";
import { createAssistantAiRuntime } from "./assistant.ai-runtime";
import type { AssistantToolAction, SendMessageInput } from "./assistant.type";
import { coerceMessagesPagination } from "./assistant.util";
import type { ApiContext } from "../../context";
import { errorReporter, formatLoggableError } from "../../observability";
import type { AssistantMessageDeltaPayload } from "../../pubsub";

type ResolverContext = ApiContext;
type AssistantMessagesArgs = { conversationId: string; limit?: number; offset?: number };
type SendMessageArgs = { input: SendMessageInput };

function createAssistantAiWorkflowForContext(ctx: ResolverContext) {
  const aiRuntime = createAssistantAiRuntime({
    publishAssistantDelta: (payload) => {
      ctx.pubsub.publish("assistant:delta", payload);
    },
    publishTodoEvent: (eventName, ...payload) => {
      ctx.pubsub.publish(eventName, ...payload);
    },
    publishNoteEvent: (eventName, ...payload) => {
      ctx.pubsub.publish(eventName, ...payload);
    }
  });

  return createAssistantAiWorkflow({
    appendMessage,
    createConversation,
    getConversationById,
    isConfigured: aiRuntime.isConfigured,
    listMessages: async (scope, conversationId) => {
      const messages = await listRecentMessages(
        scope,
        conversationId,
        coerceMessagesPagination({}).limit
      );

      return messages.map((message) => ({
        content: message.content,
        role: message.role === "assistant" ? "assistant" : "user"
      }));
    },
    reportAgentFailure: ({ conversationId, err }) => {
      // `error`, not `err`: pino's default err serializer would copy the AI
      // SDK's requestBodyValues, which holds the prompt and the conversation.
      ctx.logger.error(
        { conversationId, error: formatLoggableError(err) },
        "assistant message failed"
      );
      errorReporter.captureException(err, { conversationId, feature: "assistant" });
    },
    runAgent: aiRuntime.runAgent,
    touchConversation
  });
}

function serializeToolActionValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

export const assistantResolvers = {
  AssistantMessage: {
    toolActions(parent: { toolActions?: AssistantToolAction[] | null }) {
      return parent.toolActions ?? [];
    }
  },
  AssistantToolAction: {
    input(parent: AssistantToolAction) {
      return serializeToolActionValue(parent.input);
    },
    output(parent: AssistantToolAction) {
      return serializeToolActionValue(parent.output);
    }
  },
  Query: {
    async assistantMessages(_parent: unknown, args: AssistantMessagesArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      const conversation = await getConversationById(scope, args.conversationId);

      if (!conversation) {
        return [];
      }

      return listMessages(scope, args.conversationId, coerceMessagesPagination(args));
    },
    async conversations(
      _parent: unknown,
      args: { limit?: number; offset?: number },
      ctx: ResolverContext
    ) {
      const scope = ctx.requireOrganizationScope();
      return listConversations(scope, coerceMessagesPagination(args));
    }
  },
  Mutation: {
    async sendMessage(_parent: unknown, args: SendMessageArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createAssistantAiWorkflowForContext(ctx).sendMessage(scope, args.input);
    },
    async deleteConversation(_parent: unknown, args: { id: string }, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return deleteConversation(scope, args.id);
    }
  },
  Subscription: {
    assistantMessageDelta: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId, userId } = ctx.requireOrganizationScope();
        return pipe(
          ctx.pubsub.subscribe("assistant:delta"),
          filter(
            (payload: AssistantMessageDeltaPayload) =>
              payload.organizationId === organizationId && payload.userId === userId
          )
        );
      },
      resolve(payload: unknown) {
        return payload;
      }
    }
  }
};
