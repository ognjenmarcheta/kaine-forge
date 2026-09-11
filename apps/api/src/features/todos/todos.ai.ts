import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";

import type { CreateTodoInput } from "./todos.type";
import { ensureTodoTitle, parseOptionalDescription } from "./todos.util";
import type { PubSubEventMap } from "../../pubsub";

export type GenerateTodosStatus = "AI_NOT_CONFIGURED" | "CREATED" | "FAILED";

export interface GenerateTodosInput {
  prompt: string;
}

export interface GeneratedTodoDraft {
  description: string | null;
  title: string;
}

type TodoEventPayload = PubSubEventMap["todo:created"][0];

export interface GenerateTodosPayload {
  message?: string | null;
  status: GenerateTodosStatus;
  todos: TodoEventPayload[];
}

export interface TodoAiWorkflowAdapter {
  createTodo: (
    scope: AuthenticatedOrganizationScope,
    input: { description: string | null; title: string }
  ) => Promise<TodoEventPayload>;
  generateTodoDrafts: (input: { prompt: string }) => Promise<GeneratedTodoDraft[]>;
  isConfigured: () => boolean;
  maxGeneratedTodos: number;
  publishTodoEvent: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
  /** Object-wrapped so a later field is not a call-site break. */
  reportGenerationFailure: (input: { err: unknown }) => void;
}

function normalizeGeneratedTodo(draft: CreateTodoInput): {
  description: string | null;
  title: string;
} {
  return {
    description: parseOptionalDescription(draft.description ?? null),
    title: ensureTodoTitle(draft.title)
  };
}

export function createTodoAiWorkflow(adapter: TodoAiWorkflowAdapter) {
  return {
    async generateTodos(
      scope: AuthenticatedOrganizationScope,
      input: GenerateTodosInput
    ): Promise<GenerateTodosPayload> {
      if (!adapter.isConfigured()) {
        return {
          status: "AI_NOT_CONFIGURED",
          todos: []
        };
      }

      const prompt = input.prompt.trim();

      if (prompt.length === 0) {
        return {
          message: "PROMPT_REQUIRED",
          status: "FAILED",
          todos: []
        };
      }

      try {
        const drafts = await adapter.generateTodoDrafts({ prompt });
        const createdTodos: TodoEventPayload[] = [];

        for (const draft of drafts.slice(0, adapter.maxGeneratedTodos)) {
          const todo = await adapter.createTodo(scope, normalizeGeneratedTodo(draft));
          adapter.publishTodoEvent("todo:created", todo);
          createdTodos.push(todo);
        }

        return {
          status: createdTodos.length > 0 ? "CREATED" : "FAILED",
          todos: createdTodos
        };
      } catch (err) {
        adapter.reportGenerationFailure({ err });

        return {
          message: "AI_GENERATION_FAILED",
          status: "FAILED",
          todos: []
        };
      }
    }
  };
}
