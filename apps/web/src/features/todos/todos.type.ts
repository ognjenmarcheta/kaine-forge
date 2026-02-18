import type { CreateTodoInput, Todo, UpdateTodoInput } from "../../graphql/generated/graphql";

export type TodoItem = Pick<Todo, "completed" | "description" | "id" | "title">;

export interface TodoDraft {
  description: string;
  title: string;
}

export type CreateTodoPayload = CreateTodoInput;
export type UpdateTodoPayload = UpdateTodoInput;
