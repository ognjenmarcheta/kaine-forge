/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  T | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import { DocumentTypeDecoration } from "@graphql-typed-document-node/core";
import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
export type CreateNoteInput = {
  body?: string | null | undefined;
  title: string;
};

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

export type GenerateTodosInput = {
  prompt: string;
};

export type GenerateTodosStatus = "AI_NOT_CONFIGURED" | "CREATED" | "FAILED";

export type RequestUploadInput = {
  entityId?: string | number | null | undefined;
  entityType?: string | null | undefined;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
};

export type SendMessageInput = {
  conversationId?: string | number | null | undefined;
  message: string;
};

export type SendMessageStatus = "AI_NOT_CONFIGURED" | "FAILED" | "REPLIED";

export type UpdateNoteInput = {
  body?: string | null | undefined;
  title?: string | null | undefined;
};

export type UpdateTodoInput = {
  completed?: boolean | null | undefined;
  description?: string | null | undefined;
  title?: string | null | undefined;
};

export type GetConversationsQueryVariables = Exact<{
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;

export type GetConversationsQuery = {
  conversations: Array<{ id: string; title: string | null; updatedAt: string }>;
};

export type GetConversationQueryVariables = Exact<{
  conversationId: string | number;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;

export type GetConversationQuery = {
  assistantMessages: Array<{
    id: string;
    conversationId: string;
    role: string;
    content: string;
    createdAt: string;
    toolActions: Array<{ tool: string; input: string | null; output: string | null }>;
  }>;
};

export type DeleteConversationMutationVariables = Exact<{
  id: string | number;
}>;

export type DeleteConversationMutation = { deleteConversation: boolean };

export type SendMessageMutationVariables = Exact<{
  input: SendMessageInput;
}>;

export type SendMessageMutation = {
  sendMessage: {
    status: SendMessageStatus;
    conversationId: string;
    reply: string | null;
    message: string | null;
    toolActions: Array<{ tool: string; input: string | null; output: string | null }>;
  };
};

export type OnAssistantMessageDeltaSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnAssistantMessageDeltaSubscription = {
  assistantMessageDelta: { conversationId: string; delta: string };
};

export type HealthQueryVariables = Exact<{ [key: string]: never }>;

export type HealthQuery = { health: string };

export type GetNotesQueryVariables = Exact<{
  limit?: number | null | undefined;
  offset?: number | null | undefined;
  search?: string | null | undefined;
}>;

export type GetNotesQuery = {
  notes: Array<{
    id: string;
    title: string;
    body: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type GetNoteQueryVariables = Exact<{
  id: string | number;
}>;

export type GetNoteQuery = {
  note: {
    id: string;
    title: string;
    body: string | null;
    createdAt: string;
    updatedAt: string;
    todos: Array<{ id: string; title: string; description: string | null; completed: boolean }>;
  } | null;
};

export type CreateNoteMutationVariables = Exact<{
  input: CreateNoteInput;
}>;

export type CreateNoteMutation = { createNote: { id: string; title: string; body: string | null } };

export type UpdateNoteMutationVariables = Exact<{
  id: string | number;
  input: UpdateNoteInput;
}>;

export type UpdateNoteMutation = { updateNote: { id: string; title: string; body: string | null } };

export type DeleteNoteMutationVariables = Exact<{
  id: string | number;
}>;

export type DeleteNoteMutation = { deleteNote: boolean };

export type AddTodoToNoteMutationVariables = Exact<{
  noteId: string | number;
  input: CreateTodoInput;
}>;

export type AddTodoToNoteMutation = {
  addTodoToNote: { id: string; title: string; description: string | null; completed: boolean };
};

export type OnNoteCreatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnNoteCreatedSubscription = { noteCreated: { id: string } };

export type OnNoteUpdatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnNoteUpdatedSubscription = { noteUpdated: { id: string } };

export type OnNoteDeletedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnNoteDeletedSubscription = { noteDeleted: { id: string } };

export type GetFileQueryVariables = Exact<{
  id: string | number;
}>;

export type GetFileQuery = {
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

export type GetFilesQueryVariables = Exact<{
  filter?: FilesFilterInput | null | undefined;
}>;

export type GetFilesQuery = {
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

export type RequestUploadUrlMutationVariables = Exact<{
  input: RequestUploadInput;
}>;

export type RequestUploadUrlMutation = {
  requestUploadUrl: { fileId: string; uploadUrl: string; key: string; expiresIn: number };
};

export type ConfirmUploadMutationVariables = Exact<{
  fileId: string | number;
}>;

export type ConfirmUploadMutation = {
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

export type DeleteFileMutationVariables = Exact<{
  fileId: string | number;
}>;

export type DeleteFileMutation = { deleteFile: boolean };

export type GetTodosQueryVariables = Exact<{
  limit?: number | null | undefined;
  offset?: number | null | undefined;
  search?: string | null | undefined;
  completed?: boolean | null | undefined;
}>;

export type GetTodosQuery = {
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

export type GetTodoQueryVariables = Exact<{
  id: string | number;
}>;

export type GetTodoQuery = {
  todo: {
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
  } | null;
};

export type CreateTodoMutationVariables = Exact<{
  input: CreateTodoInput;
}>;

export type CreateTodoMutation = {
  createTodo: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  };
};

export type GenerateTodosMutationVariables = Exact<{
  input: GenerateTodosInput;
}>;

export type GenerateTodosMutation = {
  generateTodos: {
    status: GenerateTodosStatus;
    message: string | null;
    todos: Array<{
      id: string;
      title: string;
      description: string | null;
      completed: boolean;
      attachments: Array<{
        id: string;
        originalName: string;
        mimeType: string;
        sizeBytes: number;
        downloadUrl: string | null;
      }>;
    }>;
  };
};

export type UpdateTodoMutationVariables = Exact<{
  id: string | number;
  input: UpdateTodoInput;
}>;

export type UpdateTodoMutation = {
  updateTodo: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  };
};

export type DeleteTodoMutationVariables = Exact<{
  id: string | number;
}>;

export type DeleteTodoMutation = { deleteTodo: boolean };

export type ToggleTodoMutationVariables = Exact<{
  id: string | number;
}>;

export type ToggleTodoMutation = {
  toggleTodo: {
    id: string;
    completed: boolean;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      downloadUrl: string | null;
    }>;
  };
};

export type OnTodoCreatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoCreatedSubscription = {
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

export type OnTodoUpdatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoUpdatedSubscription = {
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

export type OnTodoDeletedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoDeletedSubscription = { todoDeleted: { id: string; organizationId: string } };

export type OnTodoToggledSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoToggledSubscription = {
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

export const GetConversationsDocument = new TypedDocumentString(`
    query GetConversations($limit: Int, $offset: Int) {
  conversations(limit: $limit, offset: $offset) {
    id
    title
    updatedAt
  }
}
    `);

export const useGetConversationsQuery = <TData = GetConversationsQuery, TError = unknown>(
  variables?: GetConversationsQueryVariables,
  options?: Omit<UseQueryOptions<GetConversationsQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetConversationsQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetConversationsQuery, TError, TData>({
    queryKey: variables === undefined ? ["GetConversations"] : ["GetConversations", variables],
    queryFn: useGraphqlFetcher<GetConversationsQuery, GetConversationsQueryVariables>(
      GetConversationsDocument
    ).bind(null, variables),
    ...options
  });
};

useGetConversationsQuery.getKey = (variables?: GetConversationsQueryVariables) =>
  variables === undefined ? ["GetConversations"] : ["GetConversations", variables];

export const GetConversationDocument = new TypedDocumentString(`
    query GetConversation($conversationId: ID!, $limit: Int, $offset: Int) {
  assistantMessages(
    conversationId: $conversationId
    limit: $limit
    offset: $offset
  ) {
    id
    conversationId
    role
    content
    createdAt
    toolActions {
      tool
      input
      output
    }
  }
}
    `);

export const useGetConversationQuery = <TData = GetConversationQuery, TError = unknown>(
  variables: GetConversationQueryVariables,
  options?: Omit<UseQueryOptions<GetConversationQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetConversationQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetConversationQuery, TError, TData>({
    queryKey: ["GetConversation", variables],
    queryFn: useGraphqlFetcher<GetConversationQuery, GetConversationQueryVariables>(
      GetConversationDocument
    ).bind(null, variables),
    ...options
  });
};

useGetConversationQuery.getKey = (variables: GetConversationQueryVariables) => [
  "GetConversation",
  variables
];

export const DeleteConversationDocument = new TypedDocumentString(`
    mutation DeleteConversation($id: ID!) {
  deleteConversation(id: $id)
}
    `);

export const useDeleteConversationMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    DeleteConversationMutation,
    TError,
    DeleteConversationMutationVariables,
    TContext
  >
) => {
  return useMutation<
    DeleteConversationMutation,
    TError,
    DeleteConversationMutationVariables,
    TContext
  >({
    mutationKey: ["DeleteConversation"],
    mutationFn: useGraphqlFetcher<DeleteConversationMutation, DeleteConversationMutationVariables>(
      DeleteConversationDocument
    ),
    ...options
  });
};

useDeleteConversationMutation.getKey = () => ["DeleteConversation"];

export const SendMessageDocument = new TypedDocumentString(`
    mutation SendMessage($input: SendMessageInput!) {
  sendMessage(input: $input) {
    status
    conversationId
    reply
    message
    toolActions {
      tool
      input
      output
    }
  }
}
    `);

export const useSendMessageMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<SendMessageMutation, TError, SendMessageMutationVariables, TContext>
) => {
  return useMutation<SendMessageMutation, TError, SendMessageMutationVariables, TContext>({
    mutationKey: ["SendMessage"],
    mutationFn: useGraphqlFetcher<SendMessageMutation, SendMessageMutationVariables>(
      SendMessageDocument
    ),
    ...options
  });
};

useSendMessageMutation.getKey = () => ["SendMessage"];

export const OnAssistantMessageDeltaDocument = new TypedDocumentString(`
    subscription OnAssistantMessageDelta {
  assistantMessageDelta {
    conversationId
    delta
  }
}
    `);
export const HealthDocument = new TypedDocumentString(`
    query Health {
  health
}
    `);

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

export const GetNotesDocument = new TypedDocumentString(`
    query GetNotes($limit: Int, $offset: Int, $search: String) {
  notes(limit: $limit, offset: $offset, search: $search) {
    id
    title
    body
    createdAt
    updatedAt
  }
}
    `);

export const useGetNotesQuery = <TData = GetNotesQuery, TError = unknown>(
  variables?: GetNotesQueryVariables,
  options?: Omit<UseQueryOptions<GetNotesQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetNotesQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetNotesQuery, TError, TData>({
    queryKey: variables === undefined ? ["GetNotes"] : ["GetNotes", variables],
    queryFn: useGraphqlFetcher<GetNotesQuery, GetNotesQueryVariables>(GetNotesDocument).bind(
      null,
      variables
    ),
    ...options
  });
};

useGetNotesQuery.getKey = (variables?: GetNotesQueryVariables) =>
  variables === undefined ? ["GetNotes"] : ["GetNotes", variables];

export const GetNoteDocument = new TypedDocumentString(`
    query GetNote($id: ID!) {
  note(id: $id) {
    id
    title
    body
    createdAt
    updatedAt
    todos {
      id
      title
      description
      completed
    }
  }
}
    `);

export const useGetNoteQuery = <TData = GetNoteQuery, TError = unknown>(
  variables: GetNoteQueryVariables,
  options?: Omit<UseQueryOptions<GetNoteQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetNoteQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetNoteQuery, TError, TData>({
    queryKey: ["GetNote", variables],
    queryFn: useGraphqlFetcher<GetNoteQuery, GetNoteQueryVariables>(GetNoteDocument).bind(
      null,
      variables
    ),
    ...options
  });
};

useGetNoteQuery.getKey = (variables: GetNoteQueryVariables) => ["GetNote", variables];

export const CreateNoteDocument = new TypedDocumentString(`
    mutation CreateNote($input: CreateNoteInput!) {
  createNote(input: $input) {
    id
    title
    body
  }
}
    `);

export const useCreateNoteMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<CreateNoteMutation, TError, CreateNoteMutationVariables, TContext>
) => {
  return useMutation<CreateNoteMutation, TError, CreateNoteMutationVariables, TContext>({
    mutationKey: ["CreateNote"],
    mutationFn: useGraphqlFetcher<CreateNoteMutation, CreateNoteMutationVariables>(
      CreateNoteDocument
    ),
    ...options
  });
};

useCreateNoteMutation.getKey = () => ["CreateNote"];

export const UpdateNoteDocument = new TypedDocumentString(`
    mutation UpdateNote($id: ID!, $input: UpdateNoteInput!) {
  updateNote(id: $id, input: $input) {
    id
    title
    body
  }
}
    `);

export const useUpdateNoteMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<UpdateNoteMutation, TError, UpdateNoteMutationVariables, TContext>
) => {
  return useMutation<UpdateNoteMutation, TError, UpdateNoteMutationVariables, TContext>({
    mutationKey: ["UpdateNote"],
    mutationFn: useGraphqlFetcher<UpdateNoteMutation, UpdateNoteMutationVariables>(
      UpdateNoteDocument
    ),
    ...options
  });
};

useUpdateNoteMutation.getKey = () => ["UpdateNote"];

export const DeleteNoteDocument = new TypedDocumentString(`
    mutation DeleteNote($id: ID!) {
  deleteNote(id: $id)
}
    `);

export const useDeleteNoteMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<DeleteNoteMutation, TError, DeleteNoteMutationVariables, TContext>
) => {
  return useMutation<DeleteNoteMutation, TError, DeleteNoteMutationVariables, TContext>({
    mutationKey: ["DeleteNote"],
    mutationFn: useGraphqlFetcher<DeleteNoteMutation, DeleteNoteMutationVariables>(
      DeleteNoteDocument
    ),
    ...options
  });
};

useDeleteNoteMutation.getKey = () => ["DeleteNote"];

export const AddTodoToNoteDocument = new TypedDocumentString(`
    mutation AddTodoToNote($noteId: ID!, $input: CreateTodoInput!) {
  addTodoToNote(noteId: $noteId, input: $input) {
    id
    title
    description
    completed
  }
}
    `);

export const useAddTodoToNoteMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    AddTodoToNoteMutation,
    TError,
    AddTodoToNoteMutationVariables,
    TContext
  >
) => {
  return useMutation<AddTodoToNoteMutation, TError, AddTodoToNoteMutationVariables, TContext>({
    mutationKey: ["AddTodoToNote"],
    mutationFn: useGraphqlFetcher<AddTodoToNoteMutation, AddTodoToNoteMutationVariables>(
      AddTodoToNoteDocument
    ),
    ...options
  });
};

useAddTodoToNoteMutation.getKey = () => ["AddTodoToNote"];

export const OnNoteCreatedDocument = new TypedDocumentString(`
    subscription OnNoteCreated {
  noteCreated {
    id
  }
}
    `);
export const OnNoteUpdatedDocument = new TypedDocumentString(`
    subscription OnNoteUpdated {
  noteUpdated {
    id
  }
}
    `);
export const OnNoteDeletedDocument = new TypedDocumentString(`
    subscription OnNoteDeleted {
  noteDeleted {
    id
  }
}
    `);
export const GetFileDocument = new TypedDocumentString(`
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
    `);

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

export const GetFilesDocument = new TypedDocumentString(`
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
    `);

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

export const RequestUploadUrlDocument = new TypedDocumentString(`
    mutation RequestUploadUrl($input: RequestUploadInput!) {
  requestUploadUrl(input: $input) {
    fileId
    uploadUrl
    key
    expiresIn
  }
}
    `);

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

export const ConfirmUploadDocument = new TypedDocumentString(`
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
    `);

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

export const DeleteFileDocument = new TypedDocumentString(`
    mutation DeleteFile($fileId: ID!) {
  deleteFile(fileId: $fileId)
}
    `);

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

export const GetTodosDocument = new TypedDocumentString(`
    query GetTodos($limit: Int, $offset: Int, $search: String, $completed: Boolean) {
  todos(limit: $limit, offset: $offset, search: $search, completed: $completed) {
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

export const GetTodoDocument = new TypedDocumentString(`
    query GetTodo($id: ID!) {
  todo(id: $id) {
    id
    title
    description
    completed
    createdAt
    updatedAt
    attachments {
      id
      originalName
      mimeType
      sizeBytes
      downloadUrl
    }
  }
}
    `);

export const useGetTodoQuery = <TData = GetTodoQuery, TError = unknown>(
  variables: GetTodoQueryVariables,
  options?: Omit<UseQueryOptions<GetTodoQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetTodoQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetTodoQuery, TError, TData>({
    queryKey: ["GetTodo", variables],
    queryFn: useGraphqlFetcher<GetTodoQuery, GetTodoQueryVariables>(GetTodoDocument).bind(
      null,
      variables
    ),
    ...options
  });
};

useGetTodoQuery.getKey = (variables: GetTodoQueryVariables) => ["GetTodo", variables];

export const CreateTodoDocument = new TypedDocumentString(`
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
    `);

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

export const GenerateTodosDocument = new TypedDocumentString(`
    mutation GenerateTodos($input: GenerateTodosInput!) {
  generateTodos(input: $input) {
    status
    message
    todos {
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
}
    `);

export const useGenerateTodosMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    GenerateTodosMutation,
    TError,
    GenerateTodosMutationVariables,
    TContext
  >
) => {
  return useMutation<GenerateTodosMutation, TError, GenerateTodosMutationVariables, TContext>({
    mutationKey: ["GenerateTodos"],
    mutationFn: useGraphqlFetcher<GenerateTodosMutation, GenerateTodosMutationVariables>(
      GenerateTodosDocument
    ),
    ...options
  });
};

useGenerateTodosMutation.getKey = () => ["GenerateTodos"];

export const UpdateTodoDocument = new TypedDocumentString(`
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
    `);

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

export const DeleteTodoDocument = new TypedDocumentString(`
    mutation DeleteTodo($id: ID!) {
  deleteTodo(id: $id)
}
    `);

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

export const ToggleTodoDocument = new TypedDocumentString(`
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
    `);

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

export const OnTodoCreatedDocument = new TypedDocumentString(`
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
    `);
export const OnTodoUpdatedDocument = new TypedDocumentString(`
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
    `);
export const OnTodoDeletedDocument = new TypedDocumentString(`
    subscription OnTodoDeleted {
  todoDeleted {
    id
    organizationId
  }
}
    `);
export const OnTodoToggledDocument = new TypedDocumentString(`
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
    `);
