import type {
  CreateTodoInput,
  GetMobileTodosQuery,
  ToggleMobileTodoMutation,
  UpdateTodoInput
} from "../../graphql/generated/graphql";

export type TodoItem = NonNullable<GetMobileTodosQuery["todos"]>[number];

export interface TodoDraft {
  description: string;
  title: string;
}

export type CreateTodoPayload = CreateTodoInput;
export type UpdateTodoPayload = UpdateTodoInput;
export type ToggleTodoPayload = NonNullable<ToggleMobileTodoMutation["toggleTodo"]>;
