import type { GraphQLClient } from "graphql-request";
import type { RequestInit } from "graphql-request/dist/types.dom";
import {
  useQuery,
  useMutation,
  type UseQueryOptions,
  type UseMutationOptions
} from "@tanstack/react-query";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };

function fetcher<TData, TVariables extends { [key: string]: any }>(
  client: GraphQLClient,
  query: string,
  variables?: TVariables,
  requestHeaders?: RequestInit["headers"]
) {
  return async (): Promise<TData> =>
    client.request({
      document: query,
      variables,
      requestHeaders
    });
}
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  DateTime: { input: any; output: any };
};

export type CreateTodoInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  title: Scalars["String"]["input"];
};

export type Mutation = {
  __typename?: "Mutation";
  _empty?: Maybe<Scalars["Boolean"]["output"]>;
  createTodo: Todo;
  deleteTodo: Scalars["Boolean"]["output"];
  toggleTodo: Todo;
  updateTodo: Todo;
};

export type MutationCreateTodoArgs = {
  input: CreateTodoInput;
};

export type MutationDeleteTodoArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationToggleTodoArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationUpdateTodoArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateTodoInput;
};

export type Organization = {
  __typename?: "Organization";
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  role: Scalars["String"]["output"];
  slug: Scalars["String"]["output"];
};

export type OrganizationMember = {
  __typename?: "OrganizationMember";
  email: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  role: Scalars["String"]["output"];
  userId: Scalars["ID"]["output"];
};

export type Query = {
  __typename?: "Query";
  currentOrganization?: Maybe<Organization>;
  health: Scalars["String"]["output"];
  members: Array<OrganizationMember>;
  organizations: Array<Organization>;
  todo?: Maybe<Todo>;
  todos: Array<Todo>;
};

export type QueryTodoArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryTodosArgs = {
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
};

export type Todo = {
  __typename?: "Todo";
  completed: Scalars["Boolean"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  description?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  organizationId: Scalars["ID"]["output"];
  title: Scalars["String"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
};

export type UpdateTodoInput = {
  completed?: InputMaybe<Scalars["Boolean"]["input"]>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  title?: InputMaybe<Scalars["String"]["input"]>;
};

export type HealthQueryVariables = Exact<{ [key: string]: never }>;

export type HealthQuery = { __typename?: "Query"; health: string };

export type GetTodosQueryVariables = Exact<{
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type GetTodosQuery = {
  __typename?: "Query";
  todos: Array<{
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
    createdAt: any;
    updatedAt: any;
  }>;
};

export type CreateTodoMutationVariables = Exact<{
  input: CreateTodoInput;
}>;

export type CreateTodoMutation = {
  __typename?: "Mutation";
  createTodo: {
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
  };
};

export type UpdateTodoMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
  input: UpdateTodoInput;
}>;

export type UpdateTodoMutation = {
  __typename?: "Mutation";
  updateTodo: {
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
  };
};

export type DeleteTodoMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type DeleteTodoMutation = { __typename?: "Mutation"; deleteTodo: boolean };

export type ToggleTodoMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type ToggleTodoMutation = {
  __typename?: "Mutation";
  toggleTodo: { __typename?: "Todo"; id: string; completed: boolean };
};

export const HealthDocument = `
    query Health {
  health
}
    `;

export const useHealthQuery = <TData = HealthQuery, TError = unknown>(
  client: GraphQLClient,
  variables?: HealthQueryVariables,
  options?: Omit<UseQueryOptions<HealthQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<HealthQuery, TError, TData>["queryKey"];
  },
  headers?: RequestInit["headers"]
) => {
  return useQuery<HealthQuery, TError, TData>({
    queryKey: variables === undefined ? ["Health"] : ["Health", variables],
    queryFn: fetcher<HealthQuery, HealthQueryVariables>(client, HealthDocument, variables, headers),
    ...options
  });
};

useHealthQuery.getKey = (variables?: HealthQueryVariables) =>
  variables === undefined ? ["Health"] : ["Health", variables];

export const GetTodosDocument = `
    query GetTodos($limit: Int, $offset: Int) {
  todos(limit: $limit, offset: $offset) {
    id
    title
    description
    completed
    createdAt
    updatedAt
  }
}
    `;

export const useGetTodosQuery = <TData = GetTodosQuery, TError = unknown>(
  client: GraphQLClient,
  variables?: GetTodosQueryVariables,
  options?: Omit<UseQueryOptions<GetTodosQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetTodosQuery, TError, TData>["queryKey"];
  },
  headers?: RequestInit["headers"]
) => {
  return useQuery<GetTodosQuery, TError, TData>({
    queryKey: variables === undefined ? ["GetTodos"] : ["GetTodos", variables],
    queryFn: fetcher<GetTodosQuery, GetTodosQueryVariables>(
      client,
      GetTodosDocument,
      variables,
      headers
    ),
    ...options
  });
};

useGetTodosQuery.getKey = (variables?: GetTodosQueryVariables) =>
  variables === undefined ? ["GetTodos"] : ["GetTodos", variables];

export const CreateTodoDocument = `
    mutation CreateTodo($input: CreateTodoInput!) {
  createTodo(input: $input) {
    id
    title
    description
    completed
  }
}
    `;

export const useCreateTodoMutation = <TError = unknown, TContext = unknown>(
  client: GraphQLClient,
  options?: UseMutationOptions<CreateTodoMutation, TError, CreateTodoMutationVariables, TContext>,
  headers?: RequestInit["headers"]
) => {
  return useMutation<CreateTodoMutation, TError, CreateTodoMutationVariables, TContext>({
    mutationKey: ["CreateTodo"],
    mutationFn: (variables?: CreateTodoMutationVariables) =>
      fetcher<CreateTodoMutation, CreateTodoMutationVariables>(
        client,
        CreateTodoDocument,
        variables,
        headers
      )(),
    ...options
  });
};

useCreateTodoMutation.getKey = () => ["CreateTodo"];

export const UpdateTodoDocument = `
    mutation UpdateTodo($id: ID!, $input: UpdateTodoInput!) {
  updateTodo(id: $id, input: $input) {
    id
    title
    description
    completed
  }
}
    `;

export const useUpdateTodoMutation = <TError = unknown, TContext = unknown>(
  client: GraphQLClient,
  options?: UseMutationOptions<UpdateTodoMutation, TError, UpdateTodoMutationVariables, TContext>,
  headers?: RequestInit["headers"]
) => {
  return useMutation<UpdateTodoMutation, TError, UpdateTodoMutationVariables, TContext>({
    mutationKey: ["UpdateTodo"],
    mutationFn: (variables?: UpdateTodoMutationVariables) =>
      fetcher<UpdateTodoMutation, UpdateTodoMutationVariables>(
        client,
        UpdateTodoDocument,
        variables,
        headers
      )(),
    ...options
  });
};

useUpdateTodoMutation.getKey = () => ["UpdateTodo"];

export const DeleteTodoDocument = `
    mutation DeleteTodo($id: ID!) {
  deleteTodo(id: $id)
}
    `;

export const useDeleteTodoMutation = <TError = unknown, TContext = unknown>(
  client: GraphQLClient,
  options?: UseMutationOptions<DeleteTodoMutation, TError, DeleteTodoMutationVariables, TContext>,
  headers?: RequestInit["headers"]
) => {
  return useMutation<DeleteTodoMutation, TError, DeleteTodoMutationVariables, TContext>({
    mutationKey: ["DeleteTodo"],
    mutationFn: (variables?: DeleteTodoMutationVariables) =>
      fetcher<DeleteTodoMutation, DeleteTodoMutationVariables>(
        client,
        DeleteTodoDocument,
        variables,
        headers
      )(),
    ...options
  });
};

useDeleteTodoMutation.getKey = () => ["DeleteTodo"];

export const ToggleTodoDocument = `
    mutation ToggleTodo($id: ID!) {
  toggleTodo(id: $id) {
    id
    completed
  }
}
    `;

export const useToggleTodoMutation = <TError = unknown, TContext = unknown>(
  client: GraphQLClient,
  options?: UseMutationOptions<ToggleTodoMutation, TError, ToggleTodoMutationVariables, TContext>,
  headers?: RequestInit["headers"]
) => {
  return useMutation<ToggleTodoMutation, TError, ToggleTodoMutationVariables, TContext>({
    mutationKey: ["ToggleTodo"],
    mutationFn: (variables?: ToggleTodoMutationVariables) =>
      fetcher<ToggleTodoMutation, ToggleTodoMutationVariables>(
        client,
        ToggleTodoDocument,
        variables,
        headers
      )(),
    ...options
  });
};

useToggleTodoMutation.getKey = () => ["ToggleTodo"];
