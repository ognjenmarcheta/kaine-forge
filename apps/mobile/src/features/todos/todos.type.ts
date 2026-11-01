import type { SyncTodo } from "@repo/sync";

import type {
  CreateTodoInput,
  ToggleMobileTodoMutation,
  UpdateTodoInput
} from "../../graphql/generated/react-query";

/** A Todo row from the local sync collection. */
export type TodoItem = SyncTodo;

export interface TodoDraft {
  description: string;
  title: string;
}

export type CreateTodoPayload = CreateTodoInput;
export type UpdateTodoPayload = UpdateTodoInput;
export type ToggleTodoPayload = NonNullable<ToggleMobileTodoMutation["toggleTodo"]>;
