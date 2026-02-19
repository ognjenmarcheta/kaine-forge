import { GraphQLClient } from "graphql-request";

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

export async function listTodos(
  client: GraphQLClient,
  variables: GetTodosQueryVariables
): Promise<TodoItem[]> {
  const data = await client.request<GetTodosQuery, GetTodosQueryVariables>(
    GetTodosDocument,
    variables
  );

  return data.todos;
}

export async function createTodo(
  client: GraphQLClient,
  input: CreateTodoPayload
): Promise<TodoItem> {
  const variables: CreateTodoMutationVariables = {
    input
  };

  const data = await client.request<CreateTodoMutation, CreateTodoMutationVariables>(
    CreateTodoDocument,
    variables
  );

  return data.createTodo;
}

export async function updateTodo(
  client: GraphQLClient,
  id: string,
  input: UpdateTodoPayload
): Promise<TodoItem> {
  const variables: UpdateTodoMutationVariables = {
    id,
    input
  };

  const data = await client.request<UpdateTodoMutation, UpdateTodoMutationVariables>(
    UpdateTodoDocument,
    variables
  );

  return data.updateTodo;
}

export async function deleteTodo(client: GraphQLClient, id: string): Promise<boolean> {
  const variables: DeleteTodoMutationVariables = {
    id
  };

  const data = await client.request<DeleteTodoMutation, DeleteTodoMutationVariables>(
    DeleteTodoDocument,
    variables
  );

  return data.deleteTodo;
}

export async function toggleTodo(client: GraphQLClient, id: string): Promise<TodoItem> {
  const variables: ToggleTodoMutationVariables = {
    id
  };

  const data = await client.request<ToggleTodoMutation, ToggleTodoMutationVariables>(
    ToggleTodoDocument,
    variables
  );

  return {
    completed: data.toggleTodo.completed,
    description: null,
    id: data.toggleTodo.id,
    title: ""
  };
}
