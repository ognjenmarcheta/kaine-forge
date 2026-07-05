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

export type AssistantConversation = {
  __typename?: "AssistantConversation";
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  title?: Maybe<Scalars["String"]["output"]>;
  updatedAt: Scalars["DateTime"]["output"];
};

export type AssistantMessage = {
  __typename?: "AssistantMessage";
  content: Scalars["String"]["output"];
  conversationId: Scalars["ID"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  role: Scalars["String"]["output"];
  toolActions: Array<AssistantToolAction>;
};

export type AssistantMessageDelta = {
  __typename?: "AssistantMessageDelta";
  conversationId: Scalars["ID"]["output"];
  delta: Scalars["String"]["output"];
};

export type AssistantToolAction = {
  __typename?: "AssistantToolAction";
  input?: Maybe<Scalars["String"]["output"]>;
  output?: Maybe<Scalars["String"]["output"]>;
  tool: Scalars["String"]["output"];
};

export type CreateNoteInput = {
  body?: InputMaybe<Scalars["String"]["input"]>;
  title: Scalars["String"]["input"];
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

export type GenerateTodosInput = {
  prompt: Scalars["String"]["input"];
};

export type GenerateTodosPayload = {
  __typename?: "GenerateTodosPayload";
  message?: Maybe<Scalars["String"]["output"]>;
  status: GenerateTodosStatus;
  todos: Array<Todo>;
};

export enum GenerateTodosStatus {
  AiNotConfigured = "AI_NOT_CONFIGURED",
  Created = "CREATED",
  Failed = "FAILED"
}

export type Mutation = {
  __typename?: "Mutation";
  _empty?: Maybe<Scalars["Boolean"]["output"]>;
  addTodoToNote: Todo;
  confirmUpload: FileInfo;
  createNote: Note;
  createTodo: Todo;
  deleteConversation: Scalars["Boolean"]["output"];
  deleteFile: Scalars["Boolean"]["output"];
  deleteNote: Scalars["Boolean"]["output"];
  deleteTodo: Scalars["Boolean"]["output"];
  generateTodos: GenerateTodosPayload;
  requestUploadUrl: PresignedUploadResponse;
  sendMessage: SendMessagePayload;
  toggleTodo: Todo;
  updateNote: Note;
  updateTodo: Todo;
};

export type MutationAddTodoToNoteArgs = {
  input: CreateTodoInput;
  noteId: Scalars["ID"]["input"];
};

export type MutationConfirmUploadArgs = {
  fileId: Scalars["ID"]["input"];
};

export type MutationCreateNoteArgs = {
  input: CreateNoteInput;
};

export type MutationCreateTodoArgs = {
  input: CreateTodoInput;
};

export type MutationDeleteConversationArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteFileArgs = {
  fileId: Scalars["ID"]["input"];
};

export type MutationDeleteNoteArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteTodoArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationGenerateTodosArgs = {
  input: GenerateTodosInput;
};

export type MutationRequestUploadUrlArgs = {
  input: RequestUploadInput;
};

export type MutationSendMessageArgs = {
  input: SendMessageInput;
};

export type MutationToggleTodoArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationUpdateNoteArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateNoteInput;
};

export type MutationUpdateTodoArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateTodoInput;
};

export type Note = {
  __typename?: "Note";
  body?: Maybe<Scalars["String"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  organizationId: Scalars["ID"]["output"];
  title: Scalars["String"]["output"];
  todos: Array<Todo>;
  updatedAt: Scalars["DateTime"]["output"];
};

export type NoteDeletedPayload = {
  __typename?: "NoteDeletedPayload";
  id: Scalars["ID"]["output"];
  organizationId: Scalars["ID"]["output"];
};

export type Organization = {
  __typename?: "Organization";
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  role: Scalars["String"]["output"];
  slug: Scalars["String"]["output"];
};

export type OrganizationInvitation = {
  __typename?: "OrganizationInvitation";
  email: Scalars["String"]["output"];
  expiresAt: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  role: Scalars["String"]["output"];
  status: Scalars["String"]["output"];
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
  assistantMessages: Array<AssistantMessage>;
  conversations: Array<AssistantConversation>;
  currentOrganization?: Maybe<Organization>;
  file?: Maybe<FileInfo>;
  files: Array<FileInfo>;
  health: Scalars["String"]["output"];
  invitations: Array<OrganizationInvitation>;
  members: Array<OrganizationMember>;
  note?: Maybe<Note>;
  notes: Array<Note>;
  organizations: Array<Organization>;
  todo?: Maybe<Todo>;
  todos: Array<Todo>;
};

export type QueryAssistantMessagesArgs = {
  conversationId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryConversationsArgs = {
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryFileArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryFilesArgs = {
  filter?: InputMaybe<FilesFilterInput>;
};

export type QueryNoteArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryNotesArgs = {
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
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

export type SendMessageInput = {
  conversationId?: InputMaybe<Scalars["ID"]["input"]>;
  message: Scalars["String"]["input"];
};

export type SendMessagePayload = {
  __typename?: "SendMessagePayload";
  conversationId: Scalars["ID"]["output"];
  message?: Maybe<Scalars["String"]["output"]>;
  reply?: Maybe<Scalars["String"]["output"]>;
  status: SendMessageStatus;
  toolActions: Array<AssistantToolAction>;
};

export enum SendMessageStatus {
  AiNotConfigured = "AI_NOT_CONFIGURED",
  Failed = "FAILED",
  Replied = "REPLIED"
}

export type Subscription = {
  __typename?: "Subscription";
  _empty?: Maybe<Scalars["Boolean"]["output"]>;
  assistantMessageDelta: AssistantMessageDelta;
  noteCreated: Note;
  noteDeleted: NoteDeletedPayload;
  noteUpdated: Note;
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

export type UpdateNoteInput = {
  body?: InputMaybe<Scalars["String"]["input"]>;
  title?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateTodoInput = {
  completed?: InputMaybe<Scalars["Boolean"]["input"]>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  title?: InputMaybe<Scalars["String"]["input"]>;
};

export type GetConversationsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type GetConversationsQuery = {
  __typename?: "Query";
  conversations: Array<{
    __typename?: "AssistantConversation";
    id: string;
    title?: string | null;
    updatedAt: any;
  }>;
};

export type GetConversationQueryVariables = Exact<{
  conversationId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type GetConversationQuery = {
  __typename?: "Query";
  assistantMessages: Array<{
    __typename?: "AssistantMessage";
    id: string;
    conversationId: string;
    role: string;
    content: string;
    createdAt: any;
    toolActions: Array<{
      __typename?: "AssistantToolAction";
      tool: string;
      input?: string | null;
      output?: string | null;
    }>;
  }>;
};

export type DeleteConversationMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type DeleteConversationMutation = { __typename?: "Mutation"; deleteConversation: boolean };

export type SendMessageMutationVariables = Exact<{
  input: SendMessageInput;
}>;

export type SendMessageMutation = {
  __typename?: "Mutation";
  sendMessage: {
    __typename?: "SendMessagePayload";
    status: SendMessageStatus;
    conversationId: string;
    reply?: string | null;
    message?: string | null;
    toolActions: Array<{
      __typename?: "AssistantToolAction";
      tool: string;
      input?: string | null;
      output?: string | null;
    }>;
  };
};

export type OnAssistantMessageDeltaSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnAssistantMessageDeltaSubscription = {
  __typename?: "Subscription";
  assistantMessageDelta: {
    __typename?: "AssistantMessageDelta";
    conversationId: string;
    delta: string;
  };
};

export type HealthQueryVariables = Exact<{ [key: string]: never }>;

export type HealthQuery = { __typename?: "Query"; health: string };

export type GetNotesQueryVariables = Exact<{
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type GetNotesQuery = {
  __typename?: "Query";
  notes: Array<{
    __typename?: "Note";
    id: string;
    title: string;
    body?: string | null;
    createdAt: any;
    updatedAt: any;
  }>;
};

export type GetNoteQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type GetNoteQuery = {
  __typename?: "Query";
  note?: {
    __typename?: "Note";
    id: string;
    title: string;
    body?: string | null;
    createdAt: any;
    updatedAt: any;
    todos: Array<{
      __typename?: "Todo";
      id: string;
      title: string;
      description?: string | null;
      completed: boolean;
    }>;
  } | null;
};

export type CreateNoteMutationVariables = Exact<{
  input: CreateNoteInput;
}>;

export type CreateNoteMutation = {
  __typename?: "Mutation";
  createNote: { __typename?: "Note"; id: string; title: string; body?: string | null };
};

export type UpdateNoteMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
  input: UpdateNoteInput;
}>;

export type UpdateNoteMutation = {
  __typename?: "Mutation";
  updateNote: { __typename?: "Note"; id: string; title: string; body?: string | null };
};

export type DeleteNoteMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type DeleteNoteMutation = { __typename?: "Mutation"; deleteNote: boolean };

export type AddTodoToNoteMutationVariables = Exact<{
  noteId: Scalars["ID"]["input"];
  input: CreateTodoInput;
}>;

export type AddTodoToNoteMutation = {
  __typename?: "Mutation";
  addTodoToNote: {
    __typename?: "Todo";
    id: string;
    title: string;
    description?: string | null;
    completed: boolean;
  };
};

export type OnNoteCreatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnNoteCreatedSubscription = {
  __typename?: "Subscription";
  noteCreated: { __typename?: "Note"; id: string };
};

export type OnNoteUpdatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnNoteUpdatedSubscription = {
  __typename?: "Subscription";
  noteUpdated: { __typename?: "Note"; id: string };
};

export type OnNoteDeletedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnNoteDeletedSubscription = {
  __typename?: "Subscription";
  noteDeleted: { __typename?: "NoteDeletedPayload"; id: string };
};

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

export type GenerateTodosMutationVariables = Exact<{
  input: GenerateTodosInput;
}>;

export type GenerateTodosMutation = {
  __typename?: "Mutation";
  generateTodos: {
    __typename?: "GenerateTodosPayload";
    status: GenerateTodosStatus;
    message?: string | null;
    todos: Array<{
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

export const GetConversationsDocument = `
    query GetConversations($limit: Int, $offset: Int) {
  conversations(limit: $limit, offset: $offset) {
    id
    title
    updatedAt
  }
}
    `;

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

export const GetConversationDocument = `
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
    `;

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

export const DeleteConversationDocument = `
    mutation DeleteConversation($id: ID!) {
  deleteConversation(id: $id)
}
    `;

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

export const SendMessageDocument = `
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
    `;

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

export const OnAssistantMessageDeltaDocument = `
    subscription OnAssistantMessageDelta {
  assistantMessageDelta {
    conversationId
    delta
  }
}
    `;
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

export const GetNotesDocument = `
    query GetNotes($limit: Int, $offset: Int) {
  notes(limit: $limit, offset: $offset) {
    id
    title
    body
    createdAt
    updatedAt
  }
}
    `;

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

export const GetNoteDocument = `
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
    `;

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

export const CreateNoteDocument = `
    mutation CreateNote($input: CreateNoteInput!) {
  createNote(input: $input) {
    id
    title
    body
  }
}
    `;

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

export const UpdateNoteDocument = `
    mutation UpdateNote($id: ID!, $input: UpdateNoteInput!) {
  updateNote(id: $id, input: $input) {
    id
    title
    body
  }
}
    `;

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

export const DeleteNoteDocument = `
    mutation DeleteNote($id: ID!) {
  deleteNote(id: $id)
}
    `;

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

export const AddTodoToNoteDocument = `
    mutation AddTodoToNote($noteId: ID!, $input: CreateTodoInput!) {
  addTodoToNote(noteId: $noteId, input: $input) {
    id
    title
    description
    completed
  }
}
    `;

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

export const OnNoteCreatedDocument = `
    subscription OnNoteCreated {
  noteCreated {
    id
  }
}
    `;
export const OnNoteUpdatedDocument = `
    subscription OnNoteUpdated {
  noteUpdated {
    id
  }
}
    `;
export const OnNoteDeletedDocument = `
    subscription OnNoteDeleted {
  noteDeleted {
    id
  }
}
    `;
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

export const GenerateTodosDocument = `
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
    `;

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
