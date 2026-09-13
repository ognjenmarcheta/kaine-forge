import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

import type { GeneratedTodoDraft } from "./todos.ai";
import { modelFailureCategory, startModelRun, type ModelRunTelemetry } from "../../ai.telemetry";

const DEFAULT_AI_TODO_MODELS = {
  deepseek: "deepseek-chat",
  openai: "gpt-4.1-mini"
} as const;
const MAX_GENERATED_TODOS = 5;

export type AiTodoProvider = keyof typeof DEFAULT_AI_TODO_MODELS;

/**
 * Metadata about one model call. Same rule as the assistant's: numbers and
 * enumerated config values only, nothing derived from the prompt or the
 * generated todos. Completed steps and tool calls use the shared terminal schema.
 */
export type TodoModelCallTelemetry = ModelRunTelemetry;

export interface TodoAiRuntimeDeps {
  recordModelCall: (telemetry: TodoModelCallTelemetry) => void;
}

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

export function createTodoAiRuntime({ recordModelCall }: TodoAiRuntimeDeps) {
  return {
    isConfigured: () => Boolean(resolveAiTodoConfig().apiKey),
    maxGeneratedTodos: MAX_GENERATED_TODOS,
    async generateTodoDrafts(input: {
      prompt: string;
      abortSignal?: AbortSignal;
    }): Promise<GeneratedTodoDraft[]> {
      const config = resolveAiTodoConfig();

      if (!config.apiKey) {
        return [];
      }

      const run = startModelRun(config, recordModelCall);
      try {
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
          prompt: input.prompt,
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
          onStepEnd: (step) => run.step(step.usage, step.toolCalls.length)
        });
        input.abortSignal?.throwIfAborted();
        run.finish(null, { usage: result.usage, steps: 1, toolCalls: 0 });

        return result.output.todos;
      } catch (error) {
        run.finish(
          modelFailureCategory(input.abortSignal?.aborted ? input.abortSignal.reason : error)
        );
        // Downstream failure reporters must never receive raw SDK exceptions.
        throw new Error(
          `Todo model run failed (${modelFailureCategory(input.abortSignal?.aborted ? input.abortSignal.reason : error)})`
        );
      }
    }
  };
}
