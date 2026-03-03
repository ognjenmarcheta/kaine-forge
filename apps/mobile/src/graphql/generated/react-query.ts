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

export type MobileHealthQueryVariables = Exact<{ [key: string]: never }>;

export type MobileHealthQuery = { __typename?: "Query"; health: string };

export type GetMobileFileQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type GetMobileFileQuery = {
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

export type GetMobileFilesQueryVariables = Exact<{
  filter?: InputMaybe<FilesFilterInput>;
}>;

export type GetMobileFilesQuery = {
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

export type RequestMobileUploadUrlMutationVariables = Exact<{
  input: RequestUploadInput;
}>;

export type RequestMobileUploadUrlMutation = {
  __typename?: "Mutation";
  requestUploadUrl: {
    __typename?: "PresignedUploadResponse";
    fileId: string;
    uploadUrl: string;
    key: string;
    expiresIn: number;
  };
};

export type ConfirmMobileUploadMutationVariables = Exact<{
  fileId: Scalars["ID"]["input"];
}>;

export type ConfirmMobileUploadMutation = {
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

export type DeleteMobileFileMutationVariables = Exact<{
  fileId: Scalars["ID"]["input"];
}>;

export type DeleteMobileFileMutation = { __typename?: "Mutation"; deleteFile: boolean };

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

export type OnMobileTodoCreatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnMobileTodoCreatedSubscription = {
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

export type OnMobileTodoUpdatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnMobileTodoUpdatedSubscription = {
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

export type OnMobileTodoDeletedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnMobileTodoDeletedSubscription = {
  __typename?: "Subscription";
  todoDeleted: { __typename?: "TodoDeletedPayload"; id: string; organizationId: string };
};

export type OnMobileTodoToggledSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnMobileTodoToggledSubscription = {
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

export const MobileHealthDocument = `
    query MobileHealth {
  health
}
    `;

export const useMobileHealthQuery = <TData = MobileHealthQuery, TError = unknown>(
  variables?: MobileHealthQueryVariables,
  options?: Omit<UseQueryOptions<MobileHealthQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<MobileHealthQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<MobileHealthQuery, TError, TData>({
    queryKey: variables === undefined ? ["MobileHealth"] : ["MobileHealth", variables],
    queryFn: useGraphqlFetcher<MobileHealthQuery, MobileHealthQueryVariables>(
      MobileHealthDocument
    ).bind(null, variables),
    ...options
  });
};

useMobileHealthQuery.getKey = (variables?: MobileHealthQueryVariables) =>
  variables === undefined ? ["MobileHealth"] : ["MobileHealth", variables];

export const GetMobileFileDocument = `
    query GetMobileFile($id: ID!) {
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

export const useGetMobileFileQuery = <TData = GetMobileFileQuery, TError = unknown>(
  variables: GetMobileFileQueryVariables,
  options?: Omit<UseQueryOptions<GetMobileFileQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetMobileFileQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetMobileFileQuery, TError, TData>({
    queryKey: ["GetMobileFile", variables],
    queryFn: useGraphqlFetcher<GetMobileFileQuery, GetMobileFileQueryVariables>(
      GetMobileFileDocument
    ).bind(null, variables),
    ...options
  });
};

useGetMobileFileQuery.getKey = (variables: GetMobileFileQueryVariables) => [
  "GetMobileFile",
  variables
];

export const GetMobileFilesDocument = `
    query GetMobileFiles($filter: FilesFilterInput) {
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

export const useGetMobileFilesQuery = <TData = GetMobileFilesQuery, TError = unknown>(
  variables?: GetMobileFilesQueryVariables,
  options?: Omit<UseQueryOptions<GetMobileFilesQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetMobileFilesQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetMobileFilesQuery, TError, TData>({
    queryKey: variables === undefined ? ["GetMobileFiles"] : ["GetMobileFiles", variables],
    queryFn: useGraphqlFetcher<GetMobileFilesQuery, GetMobileFilesQueryVariables>(
      GetMobileFilesDocument
    ).bind(null, variables),
    ...options
  });
};

useGetMobileFilesQuery.getKey = (variables?: GetMobileFilesQueryVariables) =>
  variables === undefined ? ["GetMobileFiles"] : ["GetMobileFiles", variables];

export const RequestMobileUploadUrlDocument = `
    mutation RequestMobileUploadUrl($input: RequestUploadInput!) {
  requestUploadUrl(input: $input) {
    fileId
    uploadUrl
    key
    expiresIn
  }
}
    `;

export const useRequestMobileUploadUrlMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    RequestMobileUploadUrlMutation,
    TError,
    RequestMobileUploadUrlMutationVariables,
    TContext
  >
) => {
  return useMutation<
    RequestMobileUploadUrlMutation,
    TError,
    RequestMobileUploadUrlMutationVariables,
    TContext
  >({
    mutationKey: ["RequestMobileUploadUrl"],
    mutationFn: useGraphqlFetcher<
      RequestMobileUploadUrlMutation,
      RequestMobileUploadUrlMutationVariables
    >(RequestMobileUploadUrlDocument),
    ...options
  });
};

useRequestMobileUploadUrlMutation.getKey = () => ["RequestMobileUploadUrl"];

export const ConfirmMobileUploadDocument = `
    mutation ConfirmMobileUpload($fileId: ID!) {
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

export const useConfirmMobileUploadMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    ConfirmMobileUploadMutation,
    TError,
    ConfirmMobileUploadMutationVariables,
    TContext
  >
) => {
  return useMutation<
    ConfirmMobileUploadMutation,
    TError,
    ConfirmMobileUploadMutationVariables,
    TContext
  >({
    mutationKey: ["ConfirmMobileUpload"],
    mutationFn: useGraphqlFetcher<
      ConfirmMobileUploadMutation,
      ConfirmMobileUploadMutationVariables
    >(ConfirmMobileUploadDocument),
    ...options
  });
};

useConfirmMobileUploadMutation.getKey = () => ["ConfirmMobileUpload"];

export const DeleteMobileFileDocument = `
    mutation DeleteMobileFile($fileId: ID!) {
  deleteFile(fileId: $fileId)
}
    `;

export const useDeleteMobileFileMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    DeleteMobileFileMutation,
    TError,
    DeleteMobileFileMutationVariables,
    TContext
  >
) => {
  return useMutation<DeleteMobileFileMutation, TError, DeleteMobileFileMutationVariables, TContext>(
    {
      mutationKey: ["DeleteMobileFile"],
      mutationFn: useGraphqlFetcher<DeleteMobileFileMutation, DeleteMobileFileMutationVariables>(
        DeleteMobileFileDocument
      ),
      ...options
    }
  );
};

useDeleteMobileFileMutation.getKey = () => ["DeleteMobileFile"];

export const GetMobileTodosDocument = `
    query GetMobileTodos($limit: Int, $offset: Int) {
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

export const useGetMobileTodosQuery = <TData = GetMobileTodosQuery, TError = unknown>(
  variables?: GetMobileTodosQueryVariables,
  options?: Omit<UseQueryOptions<GetMobileTodosQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetMobileTodosQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetMobileTodosQuery, TError, TData>({
    queryKey: variables === undefined ? ["GetMobileTodos"] : ["GetMobileTodos", variables],
    queryFn: useGraphqlFetcher<GetMobileTodosQuery, GetMobileTodosQueryVariables>(
      GetMobileTodosDocument
    ).bind(null, variables),
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

export const useCreateMobileTodoMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    CreateMobileTodoMutation,
    TError,
    CreateMobileTodoMutationVariables,
    TContext
  >
) => {
  return useMutation<CreateMobileTodoMutation, TError, CreateMobileTodoMutationVariables, TContext>(
    {
      mutationKey: ["CreateMobileTodo"],
      mutationFn: useGraphqlFetcher<CreateMobileTodoMutation, CreateMobileTodoMutationVariables>(
        CreateMobileTodoDocument
      ),
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

export const useUpdateMobileTodoMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    UpdateMobileTodoMutation,
    TError,
    UpdateMobileTodoMutationVariables,
    TContext
  >
) => {
  return useMutation<UpdateMobileTodoMutation, TError, UpdateMobileTodoMutationVariables, TContext>(
    {
      mutationKey: ["UpdateMobileTodo"],
      mutationFn: useGraphqlFetcher<UpdateMobileTodoMutation, UpdateMobileTodoMutationVariables>(
        UpdateMobileTodoDocument
      ),
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
  options?: UseMutationOptions<
    DeleteMobileTodoMutation,
    TError,
    DeleteMobileTodoMutationVariables,
    TContext
  >
) => {
  return useMutation<DeleteMobileTodoMutation, TError, DeleteMobileTodoMutationVariables, TContext>(
    {
      mutationKey: ["DeleteMobileTodo"],
      mutationFn: useGraphqlFetcher<DeleteMobileTodoMutation, DeleteMobileTodoMutationVariables>(
        DeleteMobileTodoDocument
      ),
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

export const useToggleMobileTodoMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    ToggleMobileTodoMutation,
    TError,
    ToggleMobileTodoMutationVariables,
    TContext
  >
) => {
  return useMutation<ToggleMobileTodoMutation, TError, ToggleMobileTodoMutationVariables, TContext>(
    {
      mutationKey: ["ToggleMobileTodo"],
      mutationFn: useGraphqlFetcher<ToggleMobileTodoMutation, ToggleMobileTodoMutationVariables>(
        ToggleMobileTodoDocument
      ),
      ...options
    }
  );
};

useToggleMobileTodoMutation.getKey = () => ["ToggleMobileTodo"];

export const OnMobileTodoCreatedDocument = `
    subscription OnMobileTodoCreated {
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
export const OnMobileTodoUpdatedDocument = `
    subscription OnMobileTodoUpdated {
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
export const OnMobileTodoDeletedDocument = `
    subscription OnMobileTodoDeleted {
  todoDeleted {
    id
    organizationId
  }
}
    `;
export const OnMobileTodoToggledDocument = `
    subscription OnMobileTodoToggled {
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
