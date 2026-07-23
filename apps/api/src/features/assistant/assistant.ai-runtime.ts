import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { isStepCount, streamText, type ModelMessage, type StepResult, type ToolSet } from "ai";

import { createAssistantTools } from "./assistant.tools";
import type { AssistantToolAction, ConversationMessage } from "./assistant.type";
import type { AssistantMessageDeltaPayload, PubSubEventMap } from "../../pubsub";

const DEFAULT_AI_ASSISTANT_MODELS = {
  deepseek: "deepseek-chat",
  openai: "gpt-4.1-mini"
} as const;
const MAX_ASSISTANT_STEPS = 8;

const ASSISTANT_SYSTEM_PROMPT =
  "You are a helpful assistant that manages the user's todo list. " +
  "Use the provided tools to create, list, complete, update, and delete todos. " +
  "When a todo needs to be updated, completed, or deleted, first call listTodos to find its id. " +
  "After acting, reply concisely in plain text describing what you did. Do not use markdown. " +
  "You can also create and update notes, and a note can hold a checklist of todos. Use listNotes to find a note's id before updating it or adding todos to it.";

type AiAssistantProvider = keyof typeof DEFAULT_AI_ASSISTANT_MODELS;

export interface RunAgentInput {
  conversationId: string;
  messages: ConversationMessage[];
  scope: AuthenticatedOrganizationScope;
}

function toModelMessages(messages: ConversationMessage[]): ModelMessage[] {
  return messages.map((message) =>
    message.role === "assistant"
      ? { role: "assistant", content: message.content }
      : { role: "user", content: message.content }
  );
}

export interface RunAgentResult {
  reply: string;
  toolActions: AssistantToolAction[];
}

export interface AssistantAiRuntimeDeps {
  publishAssistantDelta: (payload: AssistantMessageDeltaPayload) => void;
  publishNoteEvent: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
  publishTodoEvent: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
}

function getEnvValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function normalizeProvider(value: string | null): AiAssistantProvider | null {
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase();
  return lower === "deepseek" ? "deepseek" : lower === "openai" ? "openai" : null;
}

// Falls back to the AI_TODO_* config so the shared DeepSeek/OpenAI setup works
// for the assistant without a second set of env vars.
function getAiAssistantProvider(): AiAssistantProvider {
  return (
    normalizeProvider(getEnvValue("AI_ASSISTANT_PROVIDER")) ??
    normalizeProvider(getEnvValue("AI_TODO_PROVIDER")) ??
    "openai"
  );
}

function getAiAssistantApiKey(provider: AiAssistantProvider): string | null {
  return provider === "deepseek" ? getEnvValue("DEEPSEEK_API_KEY") : getEnvValue("OPENAI_API_KEY");
}

function getAiAssistantModel(provider: AiAssistantProvider): string {
  const explicit = getEnvValue("AI_ASSISTANT_MODEL");

  if (explicit) {
    return explicit;
  }

  const todoModel = getEnvValue("AI_TODO_MODEL");

  if (todoModel && normalizeProvider(getEnvValue("AI_TODO_PROVIDER")) === provider) {
    return todoModel;
  }

  return DEFAULT_AI_ASSISTANT_MODELS[provider];
}

function resolveAiAssistantConfig() {
  const provider = getAiAssistantProvider();

  return {
    apiKey: getAiAssistantApiKey(provider),
    model: getAiAssistantModel(provider),
    provider
  };
}

function flattenSteps<TTools extends ToolSet>(
  steps: readonly StepResult<TTools>[]
): AssistantToolAction[] {
  const actions: AssistantToolAction[] = [];

  for (const step of steps) {
    for (const call of step.toolCalls) {
      const result = step.toolResults.find((candidate) => candidate.toolCallId === call.toolCallId);

      actions.push({
        tool: call.toolName,
        input: call.input,
        output: result?.output ?? null
      });
    }
  }

  return actions;
}

export function createAssistantAiRuntime({
  publishAssistantDelta,
  publishNoteEvent,
  publishTodoEvent
}: AssistantAiRuntimeDeps) {
  return {
    isConfigured: () => Boolean(resolveAiAssistantConfig().apiKey),
    async runAgent({ conversationId, messages, scope }: RunAgentInput): Promise<RunAgentResult> {
      const config = resolveAiAssistantConfig();

      if (!config.apiKey) {
        throw new Error("assistant AI is not configured");
      }

      const model =
        config.provider === "deepseek"
          ? createDeepSeek({ apiKey: config.apiKey })(config.model)
          : createOpenAI({ apiKey: config.apiKey })(config.model);

      const result = streamText({
        model,
        instructions: ASSISTANT_SYSTEM_PROMPT,
        messages: toModelMessages(messages),
        tools: createAssistantTools({ publishNoteEvent, publishTodoEvent, scope }),
        stopWhen: isStepCount(MAX_ASSISTANT_STEPS)
      });

      for await (const delta of result.textStream) {
        if (delta.length > 0) {
          publishAssistantDelta({
            conversationId,
            delta,
            organizationId: scope.organizationId,
            userId: scope.userId
          });
        }
      }

      return {
        reply: await result.text,
        toolActions: flattenSteps(await result.steps)
      };
    }
  };
}
