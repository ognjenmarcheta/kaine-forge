import type { CreateTodoInput, UpdateTodoInput } from "../../graphql/generated/graphql";
import type { GetTodosQuery } from "../../graphql/generated/react-query";

export type TodoItem = GetTodosQuery["todos"][number];

export interface TodoDraft {
  description: string;
  title: string;
}

export type CreateTodoPayload = CreateTodoInput;
export type UpdateTodoPayload = UpdateTodoInput;
