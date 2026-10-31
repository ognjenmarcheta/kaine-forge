import type { SyncTodo } from "@repo/sync";

import type { CreateTodoInput, UpdateTodoInput } from "../../graphql/generated/graphql";

/** A Todo row from the local sync collection. */
export type TodoItem = SyncTodo;

export interface TodoDraft {
  description: string;
  title: string;
}

export type CreateTodoPayload = CreateTodoInput;
export type UpdateTodoPayload = UpdateTodoInput;
