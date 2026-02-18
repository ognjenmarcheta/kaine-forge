import type { Client } from "urql";

import type { CreateTodoPayload, TodoItem, UpdateTodoPayload } from "./todos.type";
import {
  CreateTodoDocument,
  DeleteTodoDocument,
  GetTodosDocument,
  ToggleTodoDocument,
  UpdateTodoDocument,
  type CreateTodoMutation,
  type CreateTodoMutationVariables,
  type DeleteTodoMutation,
  type DeleteTodoMutationVariables,
  type GetTodosQuery,
  type GetTodosQueryVariables,
  type ToggleTodoMutation,
  type ToggleTodoMutationVariables,
  type UpdateTodoMutation,
  type UpdateTodoMutationVariables
} from "../../graphql/generated/graphql";

function ensureData<T>(data: T | undefined, message: string): T {
  if (!data) {
    throw new Error(message);
  }

  return data;
}

export async function listTodos(
  client: Client,
  variables: GetTodosQueryVariables
): Promise<TodoItem[]> {
  const result = await client
    .query<GetTodosQuery, GetTodosQueryVariables>(GetTodosDocument, variables)
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  return ensureData(result.data, "todos response missing").todos;
}

export async function createTodo(client: Client, input: CreateTodoPayload): Promise<TodoItem> {
  const variables: CreateTodoMutationVariables = {
    input
  };

  const result = await client
    .mutation<CreateTodoMutation, CreateTodoMutationVariables>(CreateTodoDocument, variables)
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
  const variables: UpdateTodoMutationVariables = {
    id,
    input
  };

  const result = await client
    .mutation<UpdateTodoMutation, UpdateTodoMutationVariables>(UpdateTodoDocument, variables)
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  return ensureData(result.data, "update todo response missing").updateTodo;
}

export async function deleteTodo(client: Client, id: string): Promise<boolean> {
  const variables: DeleteTodoMutationVariables = {
    id
  };

  const result = await client
    .mutation<DeleteTodoMutation, DeleteTodoMutationVariables>(DeleteTodoDocument, variables)
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  return ensureData(result.data, "delete todo response missing").deleteTodo;
}

export async function toggleTodo(client: Client, id: string): Promise<TodoItem> {
  const variables: ToggleTodoMutationVariables = {
    id
  };

  const result = await client
    .mutation<ToggleTodoMutation, ToggleTodoMutationVariables>(ToggleTodoDocument, variables)
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  const data = ensureData(result.data, "toggle todo response missing").toggleTodo;

  return {
    completed: data.completed,
    description: null,
    id: data.id,
    title: ""
  };
}
