import type { Client } from "urql";

import type { CreateTodoPayload, TodoItem, UpdateTodoPayload } from "./todos.type";
import {
  CreateMobileTodoDocument,
  DeleteMobileTodoDocument,
  GetMobileTodosDocument,
  ToggleMobileTodoDocument,
  UpdateMobileTodoDocument,
  type CreateMobileTodoMutation,
  type CreateMobileTodoMutationVariables,
  type DeleteMobileTodoMutation,
  type DeleteMobileTodoMutationVariables,
  type GetMobileTodosQuery,
  type GetMobileTodosQueryVariables,
  type ToggleMobileTodoMutation,
  type ToggleMobileTodoMutationVariables,
  type UpdateMobileTodoMutation,
  type UpdateMobileTodoMutationVariables
} from "../../graphql/generated/graphql";

function ensureData<T>(data: T | undefined, message: string): T {
  if (!data) {
    throw new Error(message);
  }

  return data;
}

export async function listTodos(
  client: Client,
  variables: GetMobileTodosQueryVariables
): Promise<TodoItem[]> {
  const result = await client
    .query<GetMobileTodosQuery, GetMobileTodosQueryVariables>(GetMobileTodosDocument, variables)
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  return ensureData(result.data, "todos response missing").todos;
}

export async function createTodo(client: Client, input: CreateTodoPayload): Promise<TodoItem> {
  const variables: CreateMobileTodoMutationVariables = {
    input
  };

  const result = await client
    .mutation<
      CreateMobileTodoMutation,
      CreateMobileTodoMutationVariables
    >(CreateMobileTodoDocument, variables)
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  return ensureData(result.data, "create todo response missing").createTodo;
}

export async function updateTodo(
  client: Client,
  id: string,
  input: UpdateTodoPayload
): Promise<TodoItem> {
  const variables: UpdateMobileTodoMutationVariables = {
    id,
    input
  };

  const result = await client
    .mutation<
      UpdateMobileTodoMutation,
      UpdateMobileTodoMutationVariables
    >(UpdateMobileTodoDocument, variables)
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  return ensureData(result.data, "update todo response missing").updateTodo;
}

export async function deleteTodo(client: Client, id: string): Promise<boolean> {
  const variables: DeleteMobileTodoMutationVariables = {
    id
  };

  const result = await client
    .mutation<
      DeleteMobileTodoMutation,
      DeleteMobileTodoMutationVariables
    >(DeleteMobileTodoDocument, variables)
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  return ensureData(result.data, "delete todo response missing").deleteTodo;
}

export async function toggleTodo(client: Client, id: string): Promise<TodoItem> {
  const variables: ToggleMobileTodoMutationVariables = {
    id
  };

  const result = await client
    .mutation<
      ToggleMobileTodoMutation,
      ToggleMobileTodoMutationVariables
    >(ToggleMobileTodoDocument, variables)
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  return ensureData(result.data, "toggle todo response missing").toggleTodo;
}
