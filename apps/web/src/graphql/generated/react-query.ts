import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
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

export type FileInfo = {
  __typename?: "FileInfo";
  bucket: Scalars["String"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  downloadUrl?: Maybe<Scalars["String"]["output"]>;
  entityId?: Maybe<Scalars["ID"]["output"]>;
  entityType?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  key: Scalars["String"]["output"];
  mimeType: Scalars["String"]["output"];
  originalName: Scalars["String"]["output"];
  sizeBytes: Scalars["Int"]["output"];
  status: FileStatus;
  updatedAt: Scalars["DateTime"]["output"];
};

export enum FileStatus {
  Deleted = "deleted",
  Pending = "pending",
  Uploaded = "uploaded"
}

export type FilesFilterInput = {
  entityId?: InputMaybe<Scalars["ID"]["input"]>;
  entityType?: InputMaybe<Scalars["String"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
  status?: InputMaybe<FileStatus>;
};

export type Mutation = {
  __typename?: "Mutation";
  _empty?: Maybe<Scalars["Boolean"]["output"]>;
  confirmUpload: FileInfo;
  createTodo: Todo;
  deleteFile: Scalars["Boolean"]["output"];
  deleteTodo: Scalars["Boolean"]["output"];
  requestUploadUrl: PresignedUploadResponse;
  toggleTodo: Todo;
  updateTodo: Todo;
};

export type MutationConfirmUploadArgs = {
  fileId: Scalars["ID"]["input"];
};

export type MutationCreateTodoArgs = {
  input: CreateTodoInput;
};

export type MutationDeleteFileArgs = {
  fileId: Scalars["ID"]["input"];
};

export type MutationDeleteTodoArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationRequestUploadUrlArgs = {
  input: RequestUploadInput;
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

export type PresignedUploadResponse = {
  __typename?: "PresignedUploadResponse";
  expiresIn: Scalars["Int"]["output"];
  fileId: Scalars["ID"]["output"];
  key: Scalars["String"]["output"];
  uploadUrl: Scalars["String"]["output"];
};

export type Query = {
  __typename?: "Query";
  currentOrganization?: Maybe<Organization>;
  file?: Maybe<FileInfo>;
  files: Array<FileInfo>;
  health: Scalars["String"]["output"];
  members: Array<OrganizationMember>;
  organizations: Array<Organization>;
  todo?: Maybe<Todo>;
  todos: Array<Todo>;
};

export type QueryFileArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryFilesArgs = {
  filter?: InputMaybe<FilesFilterInput>;
};

export type QueryTodoArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryTodosArgs = {
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
};

export type RequestUploadInput = {
  entityId?: InputMaybe<Scalars["ID"]["input"]>;
  entityType?: InputMaybe<Scalars["String"]["input"]>;
  mimeType: Scalars["String"]["input"];
  originalName: Scalars["String"]["input"];
  sizeBytes: Scalars["Int"]["input"];
};

export type Subscription = {
  __typename?: "Subscription";
  _empty?: Maybe<Scalars["Boolean"]["output"]>;
  todoCreated: Todo;
  todoDeleted: TodoDeletedPayload;
  todoToggled: Todo;
  todoUpdated: Todo;
};

export type Todo = {
  __typename?: "Todo";
  attachments: Array<FileInfo>;
  completed: Scalars["Boolean"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  description?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  organizationId: Scalars["ID"]["output"];
  title: Scalars["String"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
};

export type TodoDeletedPayload = {
  __typename?: "TodoDeletedPayload";
  id: Scalars["ID"]["output"];
  organizationId: Scalars["ID"]["output"];
};

export type UpdateTodoInput = {
  completed?: InputMaybe<Scalars["Boolean"]["input"]>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  title?: InputMaybe<Scalars["String"]["input"]>;
};

export type HealthQueryVariables = Exact<{ [key: string]: never }>;

export type HealthQuery = { __typename?: "Query"; health: string };

export type GetFileQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type GetFileQuery = {
  __typename?: "Query";
  file?: {
    __typename?: "FileInfo";
    id: string;
    key: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: FileStatus;
    entityType?: string | null;
    entityId?: string | null;
    downloadUrl?: string | null;
    createdAt: any;
    updatedAt: any;
  } | null;
};

export type GetFilesQueryVariables = Exact<{
  filter?: InputMaybe<FilesFilterInput>;
}>;

export type GetFilesQuery = {
  __typename?: "Query";
  files: Array<{
    __typename?: "FileInfo";
    id: string;
    key: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: FileStatus;
    entityType?: string | null;
    entityId?: string | null;
    downloadUrl?: string | null;
    createdAt: any;
    updatedAt: any;
  }>;
};

export type RequestUploadUrlMutationVariables = Exact<{
  input: RequestUploadInput;
}>;

export type RequestUploadUrlMutation = {
  __typename?: "Mutation";
  requestUploadUrl: {
    __typename?: "PresignedUploadResponse";
    fileId: string;
    uploadUrl: string;
    key: string;
    expiresIn: number;
  };
};

export type ConfirmUploadMutationVariables = Exact<{
  fileId: Scalars["ID"]["input"];
}>;

export type ConfirmUploadMutation = {
  __typename?: "Mutation";
  confirmUpload: {
    __typename?: "FileInfo";
    id: string;
    key: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: FileStatus;
    downloadUrl?: string | null;
    createdAt: any;
    updatedAt: any;
  };
};

export type DeleteFileMutationVariables = Exact<{
  fileId: Scalars["ID"]["input"];
}>;

export type DeleteFileMutation = { __typename?: "Mutation"; deleteFile: boolean };

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
    attachments: Array<{
      __typename?: "FileInfo";
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl?: string | null;
    }>;
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
    attachments: Array<{
      __typename?: "FileInfo";
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl?: string | null;
    }>;
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
    attachments: Array<{
      __typename?: "FileInfo";
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl?: string | null;
    }>;
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
  toggleTodo: {
    __typename?: "Todo";
    id: string;
    completed: boolean;
    attachments: Array<{
      __typename?: "FileInfo";
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl?: string | null;
    }>;
  };
};

export type OnTodoCreatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoCreatedSubscription = {
  __typename?: "Subscription";
  todoCreated: {
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
    createdAt: any;
    updatedAt: any;
    attachments: Array<{
      __typename?: "FileInfo";
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl?: string | null;
    }>;
  };
};

export type OnTodoUpdatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoUpdatedSubscription = {
  __typename?: "Subscription";
  todoUpdated: {
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
    createdAt: any;
    updatedAt: any;
    attachments: Array<{
      __typename?: "FileInfo";
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl?: string | null;
    }>;
  };
};

export type OnTodoDeletedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoDeletedSubscription = {
  __typename?: "Subscription";
  todoDeleted: { __typename?: "TodoDeletedPayload"; id: string; organizationId: string };
};

export type OnTodoToggledSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoToggledSubscription = {
  __typename?: "Subscription";
  todoToggled: {
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
    createdAt: any;
    updatedAt: any;
    attachments: Array<{
      __typename?: "FileInfo";
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl?: string | null;
    }>;
  };
};

export const HealthDocument = `
    query Health {
  health
}
    `;

export const useHealthQuery = <TData = HealthQuery, TError = unknown>(
  variables?: HealthQueryVariables,
  options?: Omit<UseQueryOptions<HealthQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<HealthQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<HealthQuery, TError, TData>({
    queryKey: variables === undefined ? ["Health"] : ["Health", variables],
    queryFn: useGraphqlFetcher<HealthQuery, HealthQueryVariables>(HealthDocument).bind(
      null,
      variables
    ),
    ...options
  });
};

useHealthQuery.getKey = (variables?: HealthQueryVariables) =>
  variables === undefined ? ["Health"] : ["Health", variables];

export const GetFileDocument = `
    query GetFile($id: ID!) {
  file(id: $id) {
    id
    key
    originalName
    mimeType
    sizeBytes
    status
    entityType
    entityId
    downloadUrl
    createdAt
    updatedAt
  }
}
    `;

export const useGetFileQuery = <TData = GetFileQuery, TError = unknown>(
  variables: GetFileQueryVariables,
  options?: Omit<UseQueryOptions<GetFileQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetFileQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetFileQuery, TError, TData>({
    queryKey: ["GetFile", variables],
    queryFn: useGraphqlFetcher<GetFileQuery, GetFileQueryVariables>(GetFileDocument).bind(
      null,
      variables
    ),
    ...options
  });
};

useGetFileQuery.getKey = (variables: GetFileQueryVariables) => ["GetFile", variables];

export const GetFilesDocument = `
    query GetFiles($filter: FilesFilterInput) {
  files(filter: $filter) {
    id
    key
    originalName
    mimeType
    sizeBytes
    status
    entityType
    entityId
    downloadUrl
    createdAt
    updatedAt
  }
}
    `;

export const useGetFilesQuery = <TData = GetFilesQuery, TError = unknown>(
  variables?: GetFilesQueryVariables,
  options?: Omit<UseQueryOptions<GetFilesQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetFilesQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetFilesQuery, TError, TData>({
    queryKey: variables === undefined ? ["GetFiles"] : ["GetFiles", variables],
    queryFn: useGraphqlFetcher<GetFilesQuery, GetFilesQueryVariables>(GetFilesDocument).bind(
      null,
      variables
    ),
    ...options
  });
};

useGetFilesQuery.getKey = (variables?: GetFilesQueryVariables) =>
  variables === undefined ? ["GetFiles"] : ["GetFiles", variables];

export const RequestUploadUrlDocument = `
    mutation RequestUploadUrl($input: RequestUploadInput!) {
  requestUploadUrl(input: $input) {
    fileId
    uploadUrl
    key
    expiresIn
  }
}
    `;

export const useRequestUploadUrlMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    RequestUploadUrlMutation,
    TError,
    RequestUploadUrlMutationVariables,
    TContext
  >
) => {
  return useMutation<RequestUploadUrlMutation, TError, RequestUploadUrlMutationVariables, TContext>(
    {
      mutationKey: ["RequestUploadUrl"],
      mutationFn: useGraphqlFetcher<RequestUploadUrlMutation, RequestUploadUrlMutationVariables>(
        RequestUploadUrlDocument
      ),
      ...options
    }
  );
};

useRequestUploadUrlMutation.getKey = () => ["RequestUploadUrl"];

export const ConfirmUploadDocument = `
    mutation ConfirmUpload($fileId: ID!) {
  confirmUpload(fileId: $fileId) {
    id
    key
    originalName
    mimeType
    sizeBytes
    status
    downloadUrl
    createdAt
    updatedAt
  }
}
    `;

export const useConfirmUploadMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    ConfirmUploadMutation,
    TError,
    ConfirmUploadMutationVariables,
    TContext
  >
) => {
  return useMutation<ConfirmUploadMutation, TError, ConfirmUploadMutationVariables, TContext>({
    mutationKey: ["ConfirmUpload"],
    mutationFn: useGraphqlFetcher<ConfirmUploadMutation, ConfirmUploadMutationVariables>(
      ConfirmUploadDocument
    ),
    ...options
  });
};

useConfirmUploadMutation.getKey = () => ["ConfirmUpload"];

export const DeleteFileDocument = `
    mutation DeleteFile($fileId: ID!) {
  deleteFile(fileId: $fileId)
}
    `;

export const useDeleteFileMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<DeleteFileMutation, TError, DeleteFileMutationVariables, TContext>
) => {
  return useMutation<DeleteFileMutation, TError, DeleteFileMutationVariables, TContext>({
    mutationKey: ["DeleteFile"],
    mutationFn: useGraphqlFetcher<DeleteFileMutation, DeleteFileMutationVariables>(
      DeleteFileDocument
    ),
    ...options
  });
};

useDeleteFileMutation.getKey = () => ["DeleteFile"];

export const GetTodosDocument = `
    query GetTodos($limit: Int, $offset: Int) {
  todos(limit: $limit, offset: $offset) {
    id
    title
    description
    completed
    attachments {
      id
      originalName
      mimeType
      sizeBytes
      downloadUrl
    }
    createdAt
    updatedAt
  }
}
    `;

export const useGetTodosQuery = <TData = GetTodosQuery, TError = unknown>(
  variables?: GetTodosQueryVariables,
  options?: Omit<UseQueryOptions<GetTodosQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetTodosQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetTodosQuery, TError, TData>({
    queryKey: variables === undefined ? ["GetTodos"] : ["GetTodos", variables],
    queryFn: useGraphqlFetcher<GetTodosQuery, GetTodosQueryVariables>(GetTodosDocument).bind(
      null,
      variables
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
    attachments {
      id
      originalName
      mimeType
      sizeBytes
      downloadUrl
    }
  }
}
    `;

export const useCreateTodoMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<CreateTodoMutation, TError, CreateTodoMutationVariables, TContext>
) => {
  return useMutation<CreateTodoMutation, TError, CreateTodoMutationVariables, TContext>({
    mutationKey: ["CreateTodo"],
    mutationFn: useGraphqlFetcher<CreateTodoMutation, CreateTodoMutationVariables>(
      CreateTodoDocument
    ),
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
    attachments {
      id
      originalName
      mimeType
      sizeBytes
      downloadUrl
    }
  }
}
    `;

export const useUpdateTodoMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<UpdateTodoMutation, TError, UpdateTodoMutationVariables, TContext>
) => {
  return useMutation<UpdateTodoMutation, TError, UpdateTodoMutationVariables, TContext>({
    mutationKey: ["UpdateTodo"],
    mutationFn: useGraphqlFetcher<UpdateTodoMutation, UpdateTodoMutationVariables>(
      UpdateTodoDocument
    ),
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
  options?: UseMutationOptions<DeleteTodoMutation, TError, DeleteTodoMutationVariables, TContext>
) => {
  return useMutation<DeleteTodoMutation, TError, DeleteTodoMutationVariables, TContext>({
    mutationKey: ["DeleteTodo"],
    mutationFn: useGraphqlFetcher<DeleteTodoMutation, DeleteTodoMutationVariables>(
      DeleteTodoDocument
    ),
    ...options
  });
};

useDeleteTodoMutation.getKey = () => ["DeleteTodo"];

export const ToggleTodoDocument = `
    mutation ToggleTodo($id: ID!) {
  toggleTodo(id: $id) {
    id
    completed
    attachments {
      id
      originalName
      mimeType
      sizeBytes
      downloadUrl
    }
  }
}
    `;

export const useToggleTodoMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<ToggleTodoMutation, TError, ToggleTodoMutationVariables, TContext>
) => {
  return useMutation<ToggleTodoMutation, TError, ToggleTodoMutationVariables, TContext>({
    mutationKey: ["ToggleTodo"],
    mutationFn: useGraphqlFetcher<ToggleTodoMutation, ToggleTodoMutationVariables>(
      ToggleTodoDocument
    ),
    ...options
  });
};

useToggleTodoMutation.getKey = () => ["ToggleTodo"];

export const OnTodoCreatedDocument = `
    subscription OnTodoCreated {
  todoCreated {
    id
    title
    description
    completed
    attachments {
      id
      originalName
      mimeType
      sizeBytes
      downloadUrl
    }
    createdAt
    updatedAt
  }
}
    `;
export const OnTodoUpdatedDocument = `
    subscription OnTodoUpdated {
  todoUpdated {
    id
    title
    description
    completed
    attachments {
      id
      originalName
      mimeType
      sizeBytes
      downloadUrl
    }
    createdAt
    updatedAt
  }
}
    `;
export const OnTodoDeletedDocument = `
    subscription OnTodoDeleted {
  todoDeleted {
    id
    organizationId
  }
}
    `;
export const OnTodoToggledDocument = `
    subscription OnTodoToggled {
  todoToggled {
    id
    title
    description
    completed
    attachments {
      id
      originalName
      mimeType
      sizeBytes
      downloadUrl
    }
    createdAt
    updatedAt
  }
}
    `;
