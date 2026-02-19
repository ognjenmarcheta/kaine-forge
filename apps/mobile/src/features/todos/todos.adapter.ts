import { GraphQLClient } from "graphql-request";

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

export async function listTodos(
  client: GraphQLClient,
  variables: GetMobileTodosQueryVariables
): Promise<TodoItem[]> {
  const data = await client.request<GetMobileTodosQuery, GetMobileTodosQueryVariables>(
    GetMobileTodosDocument,
    variables
  );

  return data.todos;
}

export async function createTodo(
  client: GraphQLClient,
  input: CreateTodoPayload
): Promise<TodoItem> {
  const variables: CreateMobileTodoMutationVariables = {
    input
  };

  const data = await client.request<CreateMobileTodoMutation, CreateMobileTodoMutationVariables>(
    CreateMobileTodoDocument,
    variables
  );

  return data.createTodo;
}

export async function updateTodo(
  client: GraphQLClient,
  id: string,
  input: UpdateTodoPayload
): Promise<TodoItem> {
  const variables: UpdateMobileTodoMutationVariables = {
    id,
    input
  };

  const data = await client.request<UpdateMobileTodoMutation, UpdateMobileTodoMutationVariables>(
    UpdateMobileTodoDocument,
    variables
  );

  return data.updateTodo;
}

export async function deleteTodo(client: GraphQLClient, id: string): Promise<boolean> {
  const variables: DeleteMobileTodoMutationVariables = {
    id
  };

  const data = await client.request<DeleteMobileTodoMutation, DeleteMobileTodoMutationVariables>(
    DeleteMobileTodoDocument,
    variables
  );

  return data.deleteTodo;
}

export async function toggleTodo(client: GraphQLClient, id: string): Promise<TodoItem> {
  const variables: ToggleMobileTodoMutationVariables = {
    id
  };

  const data = await client.request<ToggleMobileTodoMutation, ToggleMobileTodoMutationVariables>(
    ToggleMobileTodoDocument,
    variables
  );

  return data.toggleTodo;
}
