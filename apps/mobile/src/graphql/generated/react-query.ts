/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  T | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import { DocumentTypeDecoration } from "@graphql-typed-document-node/core";
import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
export type CreateTodoInput = {
  description?: string | null | undefined;
  title: string;
};

export type FileStatus = "deleted" | "pending" | "uploaded";

export type FilesFilterInput = {
  entityId?: string | number | null | undefined;
  entityType?: string | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
  status?: FileStatus | null | undefined;
};

export type RequestUploadInput = {
  entityId?: string | number | null | undefined;
  entityType?: string | null | undefined;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
};

export type UpdateTodoInput = {
  completed?: boolean | null | undefined;
  description?: string | null | undefined;
  title?: string | null | undefined;
};

export type MobileHealthQueryVariables = Exact<{ [key: string]: never }>;

export type MobileHealthQuery = { health: string };

export type GetMobileFileQueryVariables = Exact<{
  id: string | number;
}>;

export type GetMobileFileQuery = {
  file: {
    id: string;
    key: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: FileStatus;
    entityType: string | null;
    entityId: string | null;
    downloadUrl: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type GetMobileFilesQueryVariables = Exact<{
  filter?: FilesFilterInput | null | undefined;
}>;

export type GetMobileFilesQuery = {
  files: Array<{
    id: string;
    key: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: FileStatus;
    entityType: string | null;
    entityId: string | null;
    downloadUrl: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type RequestMobileUploadUrlMutationVariables = Exact<{
  input: RequestUploadInput;
}>;

export type RequestMobileUploadUrlMutation = {
  requestUploadUrl: { fileId: string; uploadUrl: string; key: string; expiresIn: number };
};

export type ConfirmMobileUploadMutationVariables = Exact<{
  fileId: string | number;
}>;

export type ConfirmMobileUploadMutation = {
  confirmUpload: {
    id: string;
    key: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: FileStatus;
    downloadUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

export type DeleteMobileFileMutationVariables = Exact<{
  fileId: string | number;
}>;

export type DeleteMobileFileMutation = { deleteFile: boolean };

export type GetMobileTodosQueryVariables = Exact<{
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;

export type GetMobileTodosQuery = {
  todos: Array<{
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    createdAt: string;
    updatedAt: string;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  }>;
};

export type CreateMobileTodoMutationVariables = Exact<{
  input: CreateTodoInput;
}>;

export type CreateMobileTodoMutation = {
  createTodo: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    createdAt: string;
    updatedAt: string;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  };
};

export type UpdateMobileTodoMutationVariables = Exact<{
  id: string | number;
  input: UpdateTodoInput;
}>;

export type UpdateMobileTodoMutation = {
  updateTodo: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    createdAt: string;
    updatedAt: string;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  };
};

export type DeleteMobileTodoMutationVariables = Exact<{
  id: string | number;
}>;

export type DeleteMobileTodoMutation = { deleteTodo: boolean };

export type ToggleMobileTodoMutationVariables = Exact<{
  id: string | number;
}>;

export type ToggleMobileTodoMutation = {
  toggleTodo: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    createdAt: string;
    updatedAt: string;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  };
};

export type OnMobileTodoCreatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnMobileTodoCreatedSubscription = {
  todoCreated: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    createdAt: string;
    updatedAt: string;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  };
};

export type OnMobileTodoUpdatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnMobileTodoUpdatedSubscription = {
  todoUpdated: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    createdAt: string;
    updatedAt: string;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  };
};

export type OnMobileTodoDeletedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnMobileTodoDeletedSubscription = {
  todoDeleted: { id: string; organizationId: string };
};

export type OnMobileTodoToggledSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnMobileTodoToggledSubscription = {
  todoToggled: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    createdAt: string;
    updatedAt: string;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  };
};

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>["__apiType"]>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}

export const MobileHealthDocument = new TypedDocumentString(`
    query MobileHealth {
  health
}
    `);

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

export const GetMobileFileDocument = new TypedDocumentString(`
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
    `);

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

export const GetMobileFilesDocument = new TypedDocumentString(`
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
    `);

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

export const RequestMobileUploadUrlDocument = new TypedDocumentString(`
    mutation RequestMobileUploadUrl($input: RequestUploadInput!) {
  requestUploadUrl(input: $input) {
    fileId
    uploadUrl
    key
    expiresIn
  }
}
    `);

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

export const ConfirmMobileUploadDocument = new TypedDocumentString(`
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
    `);

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

export const DeleteMobileFileDocument = new TypedDocumentString(`
    mutation DeleteMobileFile($fileId: ID!) {
  deleteFile(fileId: $fileId)
}
    `);

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

export const GetMobileTodosDocument = new TypedDocumentString(`
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
    `);

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

export const CreateMobileTodoDocument = new TypedDocumentString(`
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
    `);

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

export const UpdateMobileTodoDocument = new TypedDocumentString(`
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
    `);

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

export const DeleteMobileTodoDocument = new TypedDocumentString(`
    mutation DeleteMobileTodo($id: ID!) {
  deleteTodo(id: $id)
}
    `);

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

export const ToggleMobileTodoDocument = new TypedDocumentString(`
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
    `);

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

export const OnMobileTodoCreatedDocument = new TypedDocumentString(`
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
    `);
export const OnMobileTodoUpdatedDocument = new TypedDocumentString(`
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
    `);
export const OnMobileTodoDeletedDocument = new TypedDocumentString(`
    subscription OnMobileTodoDeleted {
  todoDeleted {
    id
    organizationId
  }
}
    `);
export const OnMobileTodoToggledDocument = new TypedDocumentString(`
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
    `);
