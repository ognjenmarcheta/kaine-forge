import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

import type { GeneratedTodoDraft } from "./todos.ai";

const DEFAULT_AI_TODO_MODELS = {
  deepseek: "deepseek-chat",
  openai: "gpt-4.1-mini"
} as const;
const MAX_GENERATED_TODOS = 5;

type AiTodoProvider = keyof typeof DEFAULT_AI_TODO_MODELS;

const generatedTodosSchema = z.object({
  todos: z
    .array(
      z.object({
        description: z.string().nullable(),
        title: z.string().min(1).max(255)
      })
    )
    .min(1)
    .max(MAX_GENERATED_TODOS)
});

function getEnvValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function getAiTodoProvider(): AiTodoProvider {
  const provider = getEnvValue("AI_TODO_PROVIDER")?.toLowerCase();
  return provider === "deepseek" ? "deepseek" : "openai";
}

function getAiTodoApiKey(provider: AiTodoProvider): string | null {
  return provider === "deepseek" ? getEnvValue("DEEPSEEK_API_KEY") : getEnvValue("OPENAI_API_KEY");
}

function getAiTodoModel(provider: AiTodoProvider): string {
  return getEnvValue("AI_TODO_MODEL") ?? DEFAULT_AI_TODO_MODELS[provider];
}

function resolveAiTodoConfig() {
  const provider = getAiTodoProvider();

  return {
    apiKey: getAiTodoApiKey(provider),
    model: getAiTodoModel(provider),
    provider
  };
}

export function createTodoAiRuntime() {
  return {
    isConfigured: () => Boolean(resolveAiTodoConfig().apiKey),
    maxGeneratedTodos: MAX_GENERATED_TODOS,
    async generateTodoDrafts(input: { prompt: string }): Promise<GeneratedTodoDraft[]> {
      const config = resolveAiTodoConfig();

      if (!config.apiKey) {
        return [];
      }

      const model =
        config.provider === "deepseek"
          ? createDeepSeek({ apiKey: config.apiKey })(config.model)
          : createOpenAI({ apiKey: config.apiKey })(config.model);
      const result = await generateText({
        model,
        output: Output.object({
          schema: generatedTodosSchema
        }),
        instructions:
          "You generate concise todo lists. Return one to five actionable todos. Keep titles short and descriptions useful. Do not include markdown.",
        prompt: input.prompt
      });

      return result.output.todos;
    }
  };
}
