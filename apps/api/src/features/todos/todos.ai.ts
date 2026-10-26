import type { Todos } from "./todos.module";
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
  /** The Todo module's create: it normalizes the draft and publishes `todo:created`. */
  createTodo: Todos["create"];
  generateTodoDrafts: (input: { prompt: string }) => Promise<GeneratedTodoDraft[]>;
  isConfigured: () => boolean;
  maxGeneratedTodos: number;
  /** Object-wrapped so a later field is not a call-site break. */
  reportGenerationFailure: (input: { err: unknown }) => void;
}

export function createTodoAiWorkflow(adapter: TodoAiWorkflowAdapter) {
  return {
    async generateTodos(input: GenerateTodosInput): Promise<GenerateTodosPayload> {
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
          createdTodos.push(await adapter.createTodo(draft));
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
