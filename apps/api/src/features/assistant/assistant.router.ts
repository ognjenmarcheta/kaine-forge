import { filter, pipe } from "graphql-yoga";

import {
  appendMessage,
  createConversation,
  getConversationById,
  listMessages,
  touchConversation
} from "./assistant.adapter";
import { createAssistantAiWorkflow } from "./assistant.ai";
import { createAssistantAiRuntime } from "./assistant.ai-runtime";
import type { AssistantToolAction, SendMessageInput } from "./assistant.type";
import { coerceMessagesPagination } from "./assistant.util";
import type { ApiContext } from "../../context";
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
    }
  });

  return createAssistantAiWorkflow({
    appendMessage,
    createConversation,
    getConversationById,
    isConfigured: aiRuntime.isConfigured,
    listMessages: async (scope, conversationId) => {
      const messages = await listMessages(scope, conversationId, {
        limit: coerceMessagesPagination({}).limit,
        offset: 0
      });

      return messages.map((message) => ({
        content: message.content,
        role: message.role === "assistant" ? "assistant" : "user"
      }));
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
      const pagination = coerceMessagesPagination(args);

      return listMessages(scope, args.conversationId, pagination);
    }
  },
  Mutation: {
    async sendMessage(_parent: unknown, args: SendMessageArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createAssistantAiWorkflowForContext(ctx).sendMessage(scope, args.input);
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
