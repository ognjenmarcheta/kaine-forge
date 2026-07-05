/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
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

export const GetConversationsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetConversations" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } }
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "offset" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "conversations" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } }
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "offset" },
                value: { kind: "Variable", name: { kind: "Name", value: "offset" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<GetConversationsQuery, GetConversationsQueryVariables>;
export const GetConversationDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetConversation" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "conversationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } }
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "offset" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "assistantMessages" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "conversationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "conversationId" } }
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } }
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "offset" },
                value: { kind: "Variable", name: { kind: "Name", value: "offset" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "conversationId" } },
                { kind: "Field", name: { kind: "Name", value: "role" } },
                { kind: "Field", name: { kind: "Name", value: "content" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "toolActions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "tool" } },
                      { kind: "Field", name: { kind: "Name", value: "input" } },
                      { kind: "Field", name: { kind: "Name", value: "output" } }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<GetConversationQuery, GetConversationQueryVariables>;
export const DeleteConversationDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteConversation" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteConversation" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } }
              }
            ]
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<DeleteConversationMutation, DeleteConversationMutationVariables>;
export const SendMessageDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SendMessage" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "SendMessageInput" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sendMessage" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "conversationId" } },
                { kind: "Field", name: { kind: "Name", value: "reply" } },
                { kind: "Field", name: { kind: "Name", value: "message" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "toolActions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "tool" } },
                      { kind: "Field", name: { kind: "Name", value: "input" } },
                      { kind: "Field", name: { kind: "Name", value: "output" } }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<SendMessageMutation, SendMessageMutationVariables>;
export const OnAssistantMessageDeltaDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnAssistantMessageDelta" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "assistantMessageDelta" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "conversationId" } },
                { kind: "Field", name: { kind: "Name", value: "delta" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<
  OnAssistantMessageDeltaSubscription,
  OnAssistantMessageDeltaSubscriptionVariables
>;
export const HealthDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "Health" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [{ kind: "Field", name: { kind: "Name", value: "health" } }]
      }
    }
  ]
} as unknown as DocumentNode<HealthQuery, HealthQueryVariables>;
export const GetNotesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetNotes" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } }
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "offset" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "notes" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } }
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "offset" },
                value: { kind: "Variable", name: { kind: "Name", value: "offset" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "body" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<GetNotesQuery, GetNotesQueryVariables>;
export const GetNoteDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetNote" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "note" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "body" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "todos" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "title" } },
                      { kind: "Field", name: { kind: "Name", value: "description" } },
                      { kind: "Field", name: { kind: "Name", value: "completed" } }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<GetNoteQuery, GetNoteQueryVariables>;
export const CreateNoteDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateNote" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateNoteInput" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createNote" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "body" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<CreateNoteMutation, CreateNoteMutationVariables>;
export const UpdateNoteDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateNote" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UpdateNoteInput" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateNote" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } }
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "body" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<UpdateNoteMutation, UpdateNoteMutationVariables>;
export const DeleteNoteDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteNote" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteNote" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } }
              }
            ]
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<DeleteNoteMutation, DeleteNoteMutationVariables>;
export const AddTodoToNoteDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "AddTodoToNote" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "noteId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateTodoInput" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "addTodoToNote" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "noteId" },
                value: { kind: "Variable", name: { kind: "Name", value: "noteId" } }
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "description" } },
                { kind: "Field", name: { kind: "Name", value: "completed" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<AddTodoToNoteMutation, AddTodoToNoteMutationVariables>;
export const OnNoteCreatedDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnNoteCreated" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "noteCreated" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<OnNoteCreatedSubscription, OnNoteCreatedSubscriptionVariables>;
export const OnNoteUpdatedDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnNoteUpdated" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "noteUpdated" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<OnNoteUpdatedSubscription, OnNoteUpdatedSubscriptionVariables>;
export const OnNoteDeletedDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnNoteDeleted" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "noteDeleted" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<OnNoteDeletedSubscription, OnNoteDeletedSubscriptionVariables>;
export const GetFileDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetFile" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "file" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "key" } },
                { kind: "Field", name: { kind: "Name", value: "originalName" } },
                { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "entityType" } },
                { kind: "Field", name: { kind: "Name", value: "entityId" } },
                { kind: "Field", name: { kind: "Name", value: "downloadUrl" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<GetFileQuery, GetFileQueryVariables>;
export const GetFilesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetFiles" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filter" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "FilesFilterInput" } }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "files" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "filter" },
                value: { kind: "Variable", name: { kind: "Name", value: "filter" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "key" } },
                { kind: "Field", name: { kind: "Name", value: "originalName" } },
                { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "entityType" } },
                { kind: "Field", name: { kind: "Name", value: "entityId" } },
                { kind: "Field", name: { kind: "Name", value: "downloadUrl" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<GetFilesQuery, GetFilesQueryVariables>;
export const RequestUploadUrlDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RequestUploadUrl" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "RequestUploadInput" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "requestUploadUrl" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "fileId" } },
                { kind: "Field", name: { kind: "Name", value: "uploadUrl" } },
                { kind: "Field", name: { kind: "Name", value: "key" } },
                { kind: "Field", name: { kind: "Name", value: "expiresIn" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<RequestUploadUrlMutation, RequestUploadUrlMutationVariables>;
export const ConfirmUploadDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "ConfirmUpload" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "fileId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "confirmUpload" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "fileId" },
                value: { kind: "Variable", name: { kind: "Name", value: "fileId" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "key" } },
                { kind: "Field", name: { kind: "Name", value: "originalName" } },
                { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "downloadUrl" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<ConfirmUploadMutation, ConfirmUploadMutationVariables>;
export const DeleteFileDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteFile" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "fileId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteFile" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "fileId" },
                value: { kind: "Variable", name: { kind: "Name", value: "fileId" } }
              }
            ]
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<DeleteFileMutation, DeleteFileMutationVariables>;
export const GetTodosDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetTodos" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } }
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "offset" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "todos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } }
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "offset" },
                value: { kind: "Variable", name: { kind: "Name", value: "offset" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "description" } },
                { kind: "Field", name: { kind: "Name", value: "completed" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "attachments" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "originalName" } },
                      { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                      { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                      { kind: "Field", name: { kind: "Name", value: "downloadUrl" } }
                    ]
                  }
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<GetTodosQuery, GetTodosQueryVariables>;
export const CreateTodoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateTodo" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateTodoInput" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createTodo" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "description" } },
                { kind: "Field", name: { kind: "Name", value: "completed" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "attachments" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "originalName" } },
                      { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                      { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                      { kind: "Field", name: { kind: "Name", value: "downloadUrl" } }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<CreateTodoMutation, CreateTodoMutationVariables>;
export const GenerateTodosDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "GenerateTodos" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "GenerateTodosInput" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "generateTodos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "message" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "todos" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "title" } },
                      { kind: "Field", name: { kind: "Name", value: "description" } },
                      { kind: "Field", name: { kind: "Name", value: "completed" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "attachments" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "originalName" } },
                            { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                            { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                            { kind: "Field", name: { kind: "Name", value: "downloadUrl" } }
                          ]
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<GenerateTodosMutation, GenerateTodosMutationVariables>;
export const UpdateTodoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateTodo" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UpdateTodoInput" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateTodo" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } }
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "description" } },
                { kind: "Field", name: { kind: "Name", value: "completed" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "attachments" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "originalName" } },
                      { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                      { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                      { kind: "Field", name: { kind: "Name", value: "downloadUrl" } }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<UpdateTodoMutation, UpdateTodoMutationVariables>;
export const DeleteTodoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteTodo" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteTodo" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } }
              }
            ]
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<DeleteTodoMutation, DeleteTodoMutationVariables>;
export const ToggleTodoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "ToggleTodo" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } }
          }
        }
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "toggleTodo" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } }
              }
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "completed" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "attachments" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "originalName" } },
                      { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                      { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                      { kind: "Field", name: { kind: "Name", value: "downloadUrl" } }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<ToggleTodoMutation, ToggleTodoMutationVariables>;
export const OnTodoCreatedDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnTodoCreated" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "todoCreated" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "description" } },
                { kind: "Field", name: { kind: "Name", value: "completed" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "attachments" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "originalName" } },
                      { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                      { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                      { kind: "Field", name: { kind: "Name", value: "downloadUrl" } }
                    ]
                  }
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<OnTodoCreatedSubscription, OnTodoCreatedSubscriptionVariables>;
export const OnTodoUpdatedDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnTodoUpdated" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "todoUpdated" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "description" } },
                { kind: "Field", name: { kind: "Name", value: "completed" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "attachments" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "originalName" } },
                      { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                      { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                      { kind: "Field", name: { kind: "Name", value: "downloadUrl" } }
                    ]
                  }
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<OnTodoUpdatedSubscription, OnTodoUpdatedSubscriptionVariables>;
export const OnTodoDeletedDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnTodoDeleted" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "todoDeleted" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "organizationId" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<OnTodoDeletedSubscription, OnTodoDeletedSubscriptionVariables>;
export const OnTodoToggledDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnTodoToggled" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "todoToggled" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "description" } },
                { kind: "Field", name: { kind: "Name", value: "completed" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "attachments" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "originalName" } },
                      { kind: "Field", name: { kind: "Name", value: "mimeType" } },
                      { kind: "Field", name: { kind: "Name", value: "sizeBytes" } },
                      { kind: "Field", name: { kind: "Name", value: "downloadUrl" } }
                    ]
                  }
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } }
              ]
            }
          }
        ]
      }
    }
  ]
} as unknown as DocumentNode<OnTodoToggledSubscription, OnTodoToggledSubscriptionVariables>;
