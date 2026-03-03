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

export const MobileHealthDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "MobileHealth" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [{ kind: "Field", name: { kind: "Name", value: "health" } }]
      }
    }
  ]
} as unknown as DocumentNode<MobileHealthQuery, MobileHealthQueryVariables>;
export const GetMobileFileDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetMobileFile" },
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
} as unknown as DocumentNode<GetMobileFileQuery, GetMobileFileQueryVariables>;
export const GetMobileFilesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetMobileFiles" },
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
} as unknown as DocumentNode<GetMobileFilesQuery, GetMobileFilesQueryVariables>;
export const RequestMobileUploadUrlDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RequestMobileUploadUrl" },
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
} as unknown as DocumentNode<
  RequestMobileUploadUrlMutation,
  RequestMobileUploadUrlMutationVariables
>;
export const ConfirmMobileUploadDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "ConfirmMobileUpload" },
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
} as unknown as DocumentNode<ConfirmMobileUploadMutation, ConfirmMobileUploadMutationVariables>;
export const DeleteMobileFileDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteMobileFile" },
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
} as unknown as DocumentNode<DeleteMobileFileMutation, DeleteMobileFileMutationVariables>;
export const GetMobileTodosDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetMobileTodos" },
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
} as unknown as DocumentNode<GetMobileTodosQuery, GetMobileTodosQueryVariables>;
export const CreateMobileTodoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateMobileTodo" },
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
} as unknown as DocumentNode<CreateMobileTodoMutation, CreateMobileTodoMutationVariables>;
export const UpdateMobileTodoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateMobileTodo" },
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
} as unknown as DocumentNode<UpdateMobileTodoMutation, UpdateMobileTodoMutationVariables>;
export const DeleteMobileTodoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteMobileTodo" },
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
} as unknown as DocumentNode<DeleteMobileTodoMutation, DeleteMobileTodoMutationVariables>;
export const ToggleMobileTodoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "ToggleMobileTodo" },
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
} as unknown as DocumentNode<ToggleMobileTodoMutation, ToggleMobileTodoMutationVariables>;
export const OnMobileTodoCreatedDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnMobileTodoCreated" },
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
} as unknown as DocumentNode<
  OnMobileTodoCreatedSubscription,
  OnMobileTodoCreatedSubscriptionVariables
>;
export const OnMobileTodoUpdatedDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnMobileTodoUpdated" },
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
} as unknown as DocumentNode<
  OnMobileTodoUpdatedSubscription,
  OnMobileTodoUpdatedSubscriptionVariables
>;
export const OnMobileTodoDeletedDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnMobileTodoDeleted" },
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
} as unknown as DocumentNode<
  OnMobileTodoDeletedSubscription,
  OnMobileTodoDeletedSubscriptionVariables
>;
export const OnMobileTodoToggledDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OnMobileTodoToggled" },
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
} as unknown as DocumentNode<
  OnMobileTodoToggledSubscription,
  OnMobileTodoToggledSubscriptionVariables
>;
