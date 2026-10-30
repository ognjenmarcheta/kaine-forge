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
import { ASSISTANT_CONFIG } from "./assistant.config";
import type { AssistantToolAction, SendMessageInput } from "./assistant.type";
import type { ApiContext } from "../../context";
import { EMPTY_CONNECTION, type PageInput } from "../../context.data";
import { errorReporter, formatLoggableError } from "../../observability";
import type { AssistantMessageDeltaPayload } from "../../pubsub";

type ResolverContext = ApiContext;
type AssistantMessagesArgs = PageInput & { conversationId: string };
type SendMessageArgs = { input: SendMessageInput };

function createAssistantAiWorkflowForContext(ctx: ResolverContext) {
  const aiRuntime = createAssistantAiRuntime({
    publishAssistantDelta: (payload) => {
      ctx.pubsub.publish("assistant:delta", payload);
    },
    recordModelCall: (telemetry) => {
      ctx.logger.info(telemetry, "assistant model call");
    },
    notes: ctx.notes,
    todos: ctx.todos
  });

  return createAssistantAiWorkflow({
    appendMessage: (_scope, input) => appendMessage(ctx.data, input),
    createConversation: (_scope, input) => createConversation(ctx.data, input),
    getConversationById: (_scope, id) => getConversationById(ctx.data, id),
    isConfigured: aiRuntime.isConfigured,
    listMessages: async (_scope, conversationId) => {
      const messages = await listRecentMessages(
        ctx.data,
        conversationId,
        ASSISTANT_CONFIG.messages.defaultLimit
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
    touchConversation: (_scope, id) => touchConversation(ctx.data, id)
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
      const conversation = await getConversationById(ctx.data, args.conversationId);

      if (!conversation) {
        return EMPTY_CONNECTION;
      }

      return listMessages(ctx.data, args.conversationId, args);
    },
    async conversations(_parent: unknown, args: PageInput, ctx: ResolverContext) {
      return listConversations(ctx.data, args);
    }
  },
  Mutation: {
    async sendMessage(_parent: unknown, args: SendMessageArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      await ctx.billing.requireFeature("assistant");
      return createAssistantAiWorkflowForContext(ctx).sendMessage(scope, args.input);
    },
    async deleteConversation(_parent: unknown, args: { id: string }, ctx: ResolverContext) {
      return deleteConversation(ctx.data, args.id);
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
