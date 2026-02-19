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

export type MobileHealthQueryVariables = Exact<{ [key: string]: never }>;

export type MobileHealthQuery = { __typename?: "Query"; health: string };

export type GetMobileTodosQueryVariables = Exact<{
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type GetMobileTodosQuery = {
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

export type CreateMobileTodoMutationVariables = Exact<{
  input: CreateTodoInput;
}>;

export type CreateMobileTodoMutation = {
  __typename?: "Mutation";
  createTodo: {
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
    createdAt: any;
    updatedAt: any;
  };
};

export type UpdateMobileTodoMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
  input: UpdateTodoInput;
}>;

export type UpdateMobileTodoMutation = {
  __typename?: "Mutation";
  updateTodo: {
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
    createdAt: any;
    updatedAt: any;
  };
};

export type DeleteMobileTodoMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type DeleteMobileTodoMutation = { __typename?: "Mutation"; deleteTodo: boolean };

export type ToggleMobileTodoMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type ToggleMobileTodoMutation = {
  __typename?: "Mutation";
  toggleTodo: {
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
    createdAt: any;
    updatedAt: any;
  };
};

export const MobileHealthDocument = `
    query MobileHealth {
  health
}
    `;

export const useMobileHealthQuery = <TData = MobileHealthQuery, TError = unknown>(
  client: GraphQLClient,
  variables?: MobileHealthQueryVariables,
  options?: Omit<UseQueryOptions<MobileHealthQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<MobileHealthQuery, TError, TData>["queryKey"];
  },
  headers?: RequestInit["headers"]
) => {
  return useQuery<MobileHealthQuery, TError, TData>({
    queryKey: variables === undefined ? ["MobileHealth"] : ["MobileHealth", variables],
    queryFn: fetcher<MobileHealthQuery, MobileHealthQueryVariables>(
      client,
      MobileHealthDocument,
      variables,
      headers
    ),
    ...options
  });
};

useMobileHealthQuery.getKey = (variables?: MobileHealthQueryVariables) =>
  variables === undefined ? ["MobileHealth"] : ["MobileHealth", variables];

export const GetMobileTodosDocument = `
    query GetMobileTodos($limit: Int, $offset: Int) {
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

export const useGetMobileTodosQuery = <TData = GetMobileTodosQuery, TError = unknown>(
  client: GraphQLClient,
  variables?: GetMobileTodosQueryVariables,
  options?: Omit<UseQueryOptions<GetMobileTodosQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetMobileTodosQuery, TError, TData>["queryKey"];
  },
  headers?: RequestInit["headers"]
) => {
  return useQuery<GetMobileTodosQuery, TError, TData>({
    queryKey: variables === undefined ? ["GetMobileTodos"] : ["GetMobileTodos", variables],
    queryFn: fetcher<GetMobileTodosQuery, GetMobileTodosQueryVariables>(
      client,
      GetMobileTodosDocument,
      variables,
      headers
    ),
    ...options
  });
};

useGetMobileTodosQuery.getKey = (variables?: GetMobileTodosQueryVariables) =>
  variables === undefined ? ["GetMobileTodos"] : ["GetMobileTodos", variables];

export const CreateMobileTodoDocument = `
    mutation CreateMobileTodo($input: CreateTodoInput!) {
  createTodo(input: $input) {
    id
    title
    description
    completed
    createdAt
    updatedAt
  }
}
    `;

export const useCreateMobileTodoMutation = <TError = unknown, TContext = unknown>(
  client: GraphQLClient,
  options?: UseMutationOptions<
    CreateMobileTodoMutation,
    TError,
    CreateMobileTodoMutationVariables,
    TContext
  >,
  headers?: RequestInit["headers"]
) => {
  return useMutation<CreateMobileTodoMutation, TError, CreateMobileTodoMutationVariables, TContext>(
    {
      mutationKey: ["CreateMobileTodo"],
      mutationFn: (variables?: CreateMobileTodoMutationVariables) =>
        fetcher<CreateMobileTodoMutation, CreateMobileTodoMutationVariables>(
          client,
          CreateMobileTodoDocument,
          variables,
          headers
        )(),
      ...options
    }
  );
};

useCreateMobileTodoMutation.getKey = () => ["CreateMobileTodo"];

export const UpdateMobileTodoDocument = `
    mutation UpdateMobileTodo($id: ID!, $input: UpdateTodoInput!) {
  updateTodo(id: $id, input: $input) {
    id
    title
    description
    completed
    createdAt
    updatedAt
  }
}
    `;

export const useUpdateMobileTodoMutation = <TError = unknown, TContext = unknown>(
  client: GraphQLClient,
  options?: UseMutationOptions<
    UpdateMobileTodoMutation,
    TError,
    UpdateMobileTodoMutationVariables,
    TContext
  >,
  headers?: RequestInit["headers"]
) => {
  return useMutation<UpdateMobileTodoMutation, TError, UpdateMobileTodoMutationVariables, TContext>(
    {
      mutationKey: ["UpdateMobileTodo"],
      mutationFn: (variables?: UpdateMobileTodoMutationVariables) =>
        fetcher<UpdateMobileTodoMutation, UpdateMobileTodoMutationVariables>(
          client,
          UpdateMobileTodoDocument,
          variables,
          headers
        )(),
      ...options
    }
  );
};

useUpdateMobileTodoMutation.getKey = () => ["UpdateMobileTodo"];

export const DeleteMobileTodoDocument = `
    mutation DeleteMobileTodo($id: ID!) {
  deleteTodo(id: $id)
}
    `;

export const useDeleteMobileTodoMutation = <TError = unknown, TContext = unknown>(
  client: GraphQLClient,
  options?: UseMutationOptions<
    DeleteMobileTodoMutation,
    TError,
    DeleteMobileTodoMutationVariables,
    TContext
  >,
  headers?: RequestInit["headers"]
) => {
  return useMutation<DeleteMobileTodoMutation, TError, DeleteMobileTodoMutationVariables, TContext>(
    {
      mutationKey: ["DeleteMobileTodo"],
      mutationFn: (variables?: DeleteMobileTodoMutationVariables) =>
        fetcher<DeleteMobileTodoMutation, DeleteMobileTodoMutationVariables>(
          client,
          DeleteMobileTodoDocument,
          variables,
          headers
        )(),
      ...options
    }
  );
};

useDeleteMobileTodoMutation.getKey = () => ["DeleteMobileTodo"];

export const ToggleMobileTodoDocument = `
    mutation ToggleMobileTodo($id: ID!) {
  toggleTodo(id: $id) {
    id
    title
    description
    completed
    createdAt
    updatedAt
  }
}
    `;

export const useToggleMobileTodoMutation = <TError = unknown, TContext = unknown>(
  client: GraphQLClient,
  options?: UseMutationOptions<
    ToggleMobileTodoMutation,
    TError,
    ToggleMobileTodoMutationVariables,
    TContext
  >,
  headers?: RequestInit["headers"]
) => {
  return useMutation<ToggleMobileTodoMutation, TError, ToggleMobileTodoMutationVariables, TContext>(
    {
      mutationKey: ["ToggleMobileTodo"],
      mutationFn: (variables?: ToggleMobileTodoMutationVariables) =>
        fetcher<ToggleMobileTodoMutation, ToggleMobileTodoMutationVariables>(
          client,
          ToggleMobileTodoDocument,
          variables,
          headers
        )(),
      ...options
    }
  );
};

useToggleMobileTodoMutation.getKey = () => ["ToggleMobileTodo"];
