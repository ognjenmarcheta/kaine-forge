/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  T | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import { DocumentTypeDecoration } from "@graphql-typed-document-node/core";
import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
export type AttachmentEntityType = "general" | "todo";

export type AuditAction =
  | "api_key_created"
  | "api_key_revoked"
  | "attachment_deleted"
  | "feature_flag_override_changed"
  | "invitation_revoked"
  | "member_invited"
  | "member_joined"
  | "member_left"
  | "member_removed"
  | "member_role_changed"
  | "organization_deleted"
  | "organization_export_downloaded"
  | "organization_exported"
  | "organization_renamed"
  | "ownership_transferred"
  | "passkey_added"
  | "passkey_removed"
  | "password_changed"
  | "role_created"
  | "role_deleted"
  | "role_updated"
  | "two_factor_disabled"
  | "two_factor_enabled"
  | "webhook_endpoint_created"
  | "webhook_endpoint_deleted"
  | "webhook_endpoint_updated"
  | "webhook_secret_rotated";

export type CreateApiKeyInput = {
  expiresInDays?: number | null | undefined;
  name: string;
};

export type CreateNoteInput = {
  body?: string | null | undefined;
  title: string;
};

export type CreateTodoInput = {
  description?: string | null | undefined;
  title: string;
};

export type DataExportFailureReason = "error" | "too_large";

export type DataExportKind = "organization" | "user";

export type DataExportStatus = "expired" | "failed" | "pending" | "ready" | "running";

export type FeatureFlagKey = "organizations_visible";

export type FileStatus = "deleted" | "pending" | "uploaded";

export type FilesFilterInput = {
  entityId?: string | number | null | undefined;
  entityType?: AttachmentEntityType | null | undefined;
  status?: FileStatus | null | undefined;
};

export type GenerateTodosInput = {
  prompt: string;
};

export type GenerateTodosStatus = "AI_NOT_CONFIGURED" | "CREATED" | "FAILED";

export type NotificationPreferenceInput = {
  email: boolean;
  inApp: boolean;
  type: NotificationType;
};

export type NotificationType = "invitation_received" | "role_changed";

export type PublicAssetKind = "avatar" | "organization_logo";

export type RequestPublicAssetUploadInput = {
  kind: PublicAssetKind;
  mimeType: string;
  sizeBytes: number;
};

export type RequestUploadInput = {
  entityId?: string | number | null | undefined;
  entityType?: AttachmentEntityType | null | undefined;
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

export type WebhookEndpointInput = {
  eventTypes: Array<string>;
  url: string;
};

export type ApiKeyFieldsFragment = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdBy: { id: string; name: string; email: string } | null;
};

export type ApiKeysQueryVariables = Exact<{
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;

export type ApiKeysQuery = {
  apiKeys: {
    items: Array<{
      id: string;
      name: string;
      prefix: string;
      createdAt: string;
      lastUsedAt: string | null;
      expiresAt: string | null;
      createdBy: { id: string; name: string; email: string } | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type CreateApiKeyMutationVariables = Exact<{
  input: CreateApiKeyInput;
}>;

export type CreateApiKeyMutation = {
  createApiKey: {
    key: string;
    apiKey: {
      id: string;
      name: string;
      prefix: string;
      createdAt: string;
      lastUsedAt: string | null;
      expiresAt: string | null;
      createdBy: { id: string; name: string; email: string } | null;
    };
  };
};

export type RevokeApiKeyMutationVariables = Exact<{
  id: string | number;
}>;

export type RevokeApiKeyMutation = { revokeApiKey: boolean };

export type GetConversationsQueryVariables = Exact<{
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;

export type GetConversationsQuery = {
  conversations: {
    items: Array<{ id: string; title: string | null; updatedAt: string }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type GetConversationQueryVariables = Exact<{
  conversationId: string | number;
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;

export type GetConversationQuery = {
  assistantMessages: {
    items: Array<{
      id: string;
      conversationId: string;
      role: string;
      content: string;
      createdAt: string;
      toolActions: Array<{ tool: string; input: string | null; output: string | null }>;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
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

export type AuditEventsQueryVariables = Exact<{
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;

export type AuditEventsQuery = {
  auditEvents: {
    items: Array<{
      id: string;
      action: AuditAction;
      targetType: string;
      targetLabel: string | null;
      ipAddress: string | null;
      createdAt: string;
      actor: { id: string; name: string; email: string } | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type HealthQueryVariables = Exact<{ [key: string]: never }>;

export type HealthQuery = { health: string };

export type DataExportsQueryVariables = Exact<{
  kind: DataExportKind;
  first?: number | null | undefined;
}>;

export type DataExportsQuery = {
  dataExports: {
    items: Array<{
      id: string;
      kind: DataExportKind;
      status: DataExportStatus;
      sizeBytes: number | null;
      failureReason: DataExportFailureReason | null;
      createdAt: string;
      completedAt: string | null;
      expiresAt: string | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type RequestDataExportMutationVariables = Exact<{
  kind: DataExportKind;
}>;

export type RequestDataExportMutation = {
  requestDataExport: { id: string; status: DataExportStatus };
};

export type DataExportDownloadUrlMutationVariables = Exact<{
  id: string | number;
}>;

export type DataExportDownloadUrlMutation = { dataExportDownloadUrl: string };

export type FeatureFlagsQueryVariables = Exact<{ [key: string]: never }>;

export type FeatureFlagsQuery = { featureFlags: Array<{ key: FeatureFlagKey; enabled: boolean }> };

export type GetNotesQueryVariables = Exact<{
  first?: number | null | undefined;
  after?: string | null | undefined;
  search?: string | null | undefined;
}>;

export type GetNotesQuery = {
  notes: {
    items: Array<{
      id: string;
      title: string;
      body: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
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

export type NoteCountQueryVariables = Exact<{ [key: string]: never }>;

export type NoteCountQuery = { noteCount: number };

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

export type NotificationFieldsFragment = {
  id: string;
  type: NotificationType;
  organizationId: string | null;
  readAt: string | null;
  createdAt: string;
  payload:
    | {
        __typename: "InvitationReceivedNotification";
        invitationId: string;
        inviterName: string;
        organizationName: string;
        role: string;
      }
    | { __typename: "RoleChangedNotification"; organizationName: string; role: string };
};

export type NotificationsQueryVariables = Exact<{
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;

export type NotificationsQuery = {
  notifications: {
    unreadCount: number;
    items: Array<{
      id: string;
      type: NotificationType;
      organizationId: string | null;
      readAt: string | null;
      createdAt: string;
      payload:
        | {
            __typename: "InvitationReceivedNotification";
            invitationId: string;
            inviterName: string;
            organizationName: string;
            role: string;
          }
        | { __typename: "RoleChangedNotification"; organizationName: string; role: string };
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type MarkNotificationReadMutationVariables = Exact<{
  id: string | number;
}>;

export type MarkNotificationReadMutation = {
  markNotificationRead: {
    id: string;
    type: NotificationType;
    organizationId: string | null;
    readAt: string | null;
    createdAt: string;
    payload:
      | {
          __typename: "InvitationReceivedNotification";
          invitationId: string;
          inviterName: string;
          organizationName: string;
          role: string;
        }
      | { __typename: "RoleChangedNotification"; organizationName: string; role: string };
  };
};

export type MarkAllNotificationsReadMutationVariables = Exact<{ [key: string]: never }>;

export type MarkAllNotificationsReadMutation = { markAllNotificationsRead: number };

export type OnNotificationReceivedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnNotificationReceivedSubscription = {
  notificationReceived: {
    id: string;
    type: NotificationType;
    organizationId: string | null;
    readAt: string | null;
    createdAt: string;
    payload:
      | {
          __typename: "InvitationReceivedNotification";
          invitationId: string;
          inviterName: string;
          organizationName: string;
          role: string;
        }
      | { __typename: "RoleChangedNotification"; organizationName: string; role: string };
  };
};

export type NotificationPreferencesQueryVariables = Exact<{ [key: string]: never }>;

export type NotificationPreferencesQuery = {
  notificationPreferences: Array<{
    type: NotificationType;
    inApp: boolean;
    email: boolean;
    emailAvailable: boolean;
  }>;
};

export type UpdateNotificationPreferenceMutationVariables = Exact<{
  input: NotificationPreferenceInput;
}>;

export type UpdateNotificationPreferenceMutation = {
  updateNotificationPreference: {
    type: NotificationType;
    inApp: boolean;
    email: boolean;
    emailAvailable: boolean;
  };
};

export type OrganizationPermissionsQueryVariables = Exact<{ [key: string]: never }>;

export type OrganizationPermissionsQuery = { organizationPermissions: Array<string> };

export type GetPublicAssetsQueryVariables = Exact<{ [key: string]: never }>;

export type GetPublicAssetsQuery = {
  publicAssets: { avatarUrl: string | null; organizationLogoUrl: string | null };
};

export type RequestPublicAssetUploadMutationVariables = Exact<{
  input: RequestPublicAssetUploadInput;
}>;

export type RequestPublicAssetUploadMutation = {
  requestPublicAssetUpload: { uploadUrl: string; stagingKey: string; expiresIn: number };
};

export type ConfirmPublicAssetUploadMutationVariables = Exact<{
  kind: PublicAssetKind;
  stagingKey: string;
}>;

export type ConfirmPublicAssetUploadMutation = {
  confirmPublicAssetUpload: { avatarUrl: string | null; organizationLogoUrl: string | null };
};

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
    entityType: AttachmentEntityType | null;
    entityId: string | null;
    downloadUrl: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type GetFilesQueryVariables = Exact<{
  filter?: FilesFilterInput | null | undefined;
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;

export type GetFilesQuery = {
  files: {
    items: Array<{
      id: string;
      key: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      status: FileStatus;
      entityType: AttachmentEntityType | null;
      entityId: string | null;
      downloadUrl: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
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
  first?: number | null | undefined;
  after?: string | null | undefined;
  search?: string | null | undefined;
  completed?: boolean | null | undefined;
}>;

export type GetTodosQuery = {
  todos: {
    items: Array<{
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
        thumbnailUrl: string | null;
      }>;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
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
      thumbnailUrl: string | null;
    }>;
  } | null;
};

export type TodoCountsQueryVariables = Exact<{ [key: string]: never }>;

export type TodoCountsQuery = { todoCounts: { open: number; completed: number } };

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
      thumbnailUrl: string | null;
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
        thumbnailUrl: string | null;
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
      thumbnailUrl: string | null;
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
      thumbnailUrl: string | null;
    }>;
  };
};

export type OnTodoCreatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoCreatedSubscription = { todoCreated: { id: string } };

export type OnTodoUpdatedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoUpdatedSubscription = { todoUpdated: { id: string } };

export type OnTodoDeletedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoDeletedSubscription = { todoDeleted: { id: string } };

export type OnTodoToggledSubscriptionVariables = Exact<{ [key: string]: never }>;

export type OnTodoToggledSubscription = { todoToggled: { id: string } };

export type WebhookEndpointFieldsFragment = {
  id: string;
  url: string;
  eventTypes: Array<string>;
  createdAt: string;
  updatedAt: string;
};

export type WebhookEventTypesQueryVariables = Exact<{ [key: string]: never }>;

export type WebhookEventTypesQuery = { webhookEventTypes: Array<string> };

export type WebhookEndpointsQueryVariables = Exact<{
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;

export type WebhookEndpointsQuery = {
  webhookEndpoints: {
    items: Array<{
      id: string;
      url: string;
      eventTypes: Array<string>;
      createdAt: string;
      updatedAt: string;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type WebhookDeliveriesQueryVariables = Exact<{
  endpointId: string | number;
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;

export type WebhookDeliveriesQuery = {
  webhookDeliveries: {
    items: Array<{
      id: string;
      eventId: string;
      eventType: string;
      attempt: number;
      statusCode: number | null;
      durationMs: number;
      error: string | null;
      createdAt: string;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type CreateWebhookEndpointMutationVariables = Exact<{
  input: WebhookEndpointInput;
}>;

export type CreateWebhookEndpointMutation = {
  createWebhookEndpoint: {
    secret: string;
    endpoint: {
      id: string;
      url: string;
      eventTypes: Array<string>;
      createdAt: string;
      updatedAt: string;
    };
  };
};

export type UpdateWebhookEndpointMutationVariables = Exact<{
  id: string | number;
  input: WebhookEndpointInput;
}>;

export type UpdateWebhookEndpointMutation = {
  updateWebhookEndpoint: {
    id: string;
    url: string;
    eventTypes: Array<string>;
    createdAt: string;
    updatedAt: string;
  };
};

export type DeleteWebhookEndpointMutationVariables = Exact<{
  id: string | number;
}>;

export type DeleteWebhookEndpointMutation = { deleteWebhookEndpoint: boolean };

export type RotateWebhookSecretMutationVariables = Exact<{
  id: string | number;
}>;

export type RotateWebhookSecretMutation = { rotateWebhookSecret: string };

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
export const ApiKeyFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment ApiKeyFields on ApiKey {
  id
  name
  prefix
  createdBy {
    id
    name
    email
  }
  createdAt
  lastUsedAt
  expiresAt
}
    `,
  { fragmentName: "ApiKeyFields" }
);
export const NotificationFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment NotificationFields on Notification {
  id
  type
  organizationId
  readAt
  createdAt
  payload {
    __typename
    ... on InvitationReceivedNotification {
      invitationId
      inviterName
      organizationName
      role
    }
    ... on RoleChangedNotification {
      organizationName
      role
    }
  }
}
    `,
  { fragmentName: "NotificationFields" }
);
export const WebhookEndpointFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment WebhookEndpointFields on WebhookEndpoint {
  id
  url
  eventTypes
  createdAt
  updatedAt
}
    `,
  { fragmentName: "WebhookEndpointFields" }
);
export const ApiKeysDocument = new TypedDocumentString(`
    query ApiKeys($first: Int, $after: String) {
  apiKeys(first: $first, after: $after) {
    items {
      ...ApiKeyFields
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    fragment ApiKeyFields on ApiKey {
  id
  name
  prefix
  createdBy {
    id
    name
    email
  }
  createdAt
  lastUsedAt
  expiresAt
}`);

export const useApiKeysQuery = <TData = ApiKeysQuery, TError = unknown>(
  variables?: ApiKeysQueryVariables,
  options?: Omit<UseQueryOptions<ApiKeysQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<ApiKeysQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<ApiKeysQuery, TError, TData>({
    queryKey: variables === undefined ? ["ApiKeys"] : ["ApiKeys", variables],
    queryFn: useGraphqlFetcher<ApiKeysQuery, ApiKeysQueryVariables>(ApiKeysDocument).bind(
      null,
      variables
    ),
    ...options
  });
};

useApiKeysQuery.getKey = (variables?: ApiKeysQueryVariables) =>
  variables === undefined ? ["ApiKeys"] : ["ApiKeys", variables];

export const CreateApiKeyDocument = new TypedDocumentString(`
    mutation CreateApiKey($input: CreateApiKeyInput!) {
  createApiKey(input: $input) {
    apiKey {
      ...ApiKeyFields
    }
    key
  }
}
    fragment ApiKeyFields on ApiKey {
  id
  name
  prefix
  createdBy {
    id
    name
    email
  }
  createdAt
  lastUsedAt
  expiresAt
}`);

export const useCreateApiKeyMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    CreateApiKeyMutation,
    TError,
    CreateApiKeyMutationVariables,
    TContext
  >
) => {
  return useMutation<CreateApiKeyMutation, TError, CreateApiKeyMutationVariables, TContext>({
    mutationKey: ["CreateApiKey"],
    mutationFn: useGraphqlFetcher<CreateApiKeyMutation, CreateApiKeyMutationVariables>(
      CreateApiKeyDocument
    ),
    ...options
  });
};

useCreateApiKeyMutation.getKey = () => ["CreateApiKey"];

export const RevokeApiKeyDocument = new TypedDocumentString(`
    mutation RevokeApiKey($id: ID!) {
  revokeApiKey(id: $id)
}
    `);

export const useRevokeApiKeyMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    RevokeApiKeyMutation,
    TError,
    RevokeApiKeyMutationVariables,
    TContext
  >
) => {
  return useMutation<RevokeApiKeyMutation, TError, RevokeApiKeyMutationVariables, TContext>({
    mutationKey: ["RevokeApiKey"],
    mutationFn: useGraphqlFetcher<RevokeApiKeyMutation, RevokeApiKeyMutationVariables>(
      RevokeApiKeyDocument
    ),
    ...options
  });
};

useRevokeApiKeyMutation.getKey = () => ["RevokeApiKey"];

export const GetConversationsDocument = new TypedDocumentString(`
    query GetConversations($first: Int, $after: String) {
  conversations(first: $first, after: $after) {
    items {
      id
      title
      updatedAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
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
    query GetConversation($conversationId: ID!, $first: Int, $after: String) {
  assistantMessages(conversationId: $conversationId, first: $first, after: $after) {
    items {
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
    pageInfo {
      hasNextPage
      endCursor
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
export const AuditEventsDocument = new TypedDocumentString(`
    query AuditEvents($first: Int, $after: String) {
  auditEvents(first: $first, after: $after) {
    items {
      id
      action
      actor {
        id
        name
        email
      }
      targetType
      targetLabel
      ipAddress
      createdAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    `);

export const useAuditEventsQuery = <TData = AuditEventsQuery, TError = unknown>(
  variables?: AuditEventsQueryVariables,
  options?: Omit<UseQueryOptions<AuditEventsQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<AuditEventsQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<AuditEventsQuery, TError, TData>({
    queryKey: variables === undefined ? ["AuditEvents"] : ["AuditEvents", variables],
    queryFn: useGraphqlFetcher<AuditEventsQuery, AuditEventsQueryVariables>(
      AuditEventsDocument
    ).bind(null, variables),
    ...options
  });
};

useAuditEventsQuery.getKey = (variables?: AuditEventsQueryVariables) =>
  variables === undefined ? ["AuditEvents"] : ["AuditEvents", variables];

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

export const DataExportsDocument = new TypedDocumentString(`
    query DataExports($kind: DataExportKind!, $first: Int) {
  dataExports(kind: $kind, first: $first) {
    items {
      id
      kind
      status
      sizeBytes
      failureReason
      createdAt
      completedAt
      expiresAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    `);

export const useDataExportsQuery = <TData = DataExportsQuery, TError = unknown>(
  variables: DataExportsQueryVariables,
  options?: Omit<UseQueryOptions<DataExportsQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<DataExportsQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<DataExportsQuery, TError, TData>({
    queryKey: ["DataExports", variables],
    queryFn: useGraphqlFetcher<DataExportsQuery, DataExportsQueryVariables>(
      DataExportsDocument
    ).bind(null, variables),
    ...options
  });
};

useDataExportsQuery.getKey = (variables: DataExportsQueryVariables) => ["DataExports", variables];

export const RequestDataExportDocument = new TypedDocumentString(`
    mutation RequestDataExport($kind: DataExportKind!) {
  requestDataExport(kind: $kind) {
    id
    status
  }
}
    `);

export const useRequestDataExportMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    RequestDataExportMutation,
    TError,
    RequestDataExportMutationVariables,
    TContext
  >
) => {
  return useMutation<
    RequestDataExportMutation,
    TError,
    RequestDataExportMutationVariables,
    TContext
  >({
    mutationKey: ["RequestDataExport"],
    mutationFn: useGraphqlFetcher<RequestDataExportMutation, RequestDataExportMutationVariables>(
      RequestDataExportDocument
    ),
    ...options
  });
};

useRequestDataExportMutation.getKey = () => ["RequestDataExport"];

export const DataExportDownloadUrlDocument = new TypedDocumentString(`
    mutation DataExportDownloadUrl($id: ID!) {
  dataExportDownloadUrl(id: $id)
}
    `);

export const useDataExportDownloadUrlMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    DataExportDownloadUrlMutation,
    TError,
    DataExportDownloadUrlMutationVariables,
    TContext
  >
) => {
  return useMutation<
    DataExportDownloadUrlMutation,
    TError,
    DataExportDownloadUrlMutationVariables,
    TContext
  >({
    mutationKey: ["DataExportDownloadUrl"],
    mutationFn: useGraphqlFetcher<
      DataExportDownloadUrlMutation,
      DataExportDownloadUrlMutationVariables
    >(DataExportDownloadUrlDocument),
    ...options
  });
};

useDataExportDownloadUrlMutation.getKey = () => ["DataExportDownloadUrl"];

export const FeatureFlagsDocument = new TypedDocumentString(`
    query FeatureFlags {
  featureFlags {
    key
    enabled
  }
}
    `);

export const useFeatureFlagsQuery = <TData = FeatureFlagsQuery, TError = unknown>(
  variables?: FeatureFlagsQueryVariables,
  options?: Omit<UseQueryOptions<FeatureFlagsQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<FeatureFlagsQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<FeatureFlagsQuery, TError, TData>({
    queryKey: variables === undefined ? ["FeatureFlags"] : ["FeatureFlags", variables],
    queryFn: useGraphqlFetcher<FeatureFlagsQuery, FeatureFlagsQueryVariables>(
      FeatureFlagsDocument
    ).bind(null, variables),
    ...options
  });
};

useFeatureFlagsQuery.getKey = (variables?: FeatureFlagsQueryVariables) =>
  variables === undefined ? ["FeatureFlags"] : ["FeatureFlags", variables];

export const GetNotesDocument = new TypedDocumentString(`
    query GetNotes($first: Int, $after: String, $search: String) {
  notes(first: $first, after: $after, search: $search) {
    items {
      id
      title
      body
      createdAt
      updatedAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
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

export const NoteCountDocument = new TypedDocumentString(`
    query NoteCount {
  noteCount
}
    `);

export const useNoteCountQuery = <TData = NoteCountQuery, TError = unknown>(
  variables?: NoteCountQueryVariables,
  options?: Omit<UseQueryOptions<NoteCountQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<NoteCountQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<NoteCountQuery, TError, TData>({
    queryKey: variables === undefined ? ["NoteCount"] : ["NoteCount", variables],
    queryFn: useGraphqlFetcher<NoteCountQuery, NoteCountQueryVariables>(NoteCountDocument).bind(
      null,
      variables
    ),
    ...options
  });
};

useNoteCountQuery.getKey = (variables?: NoteCountQueryVariables) =>
  variables === undefined ? ["NoteCount"] : ["NoteCount", variables];

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
export const NotificationsDocument = new TypedDocumentString(`
    query Notifications($first: Int, $after: String) {
  notifications(first: $first, after: $after) {
    items {
      ...NotificationFields
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    unreadCount
  }
}
    fragment NotificationFields on Notification {
  id
  type
  organizationId
  readAt
  createdAt
  payload {
    __typename
    ... on InvitationReceivedNotification {
      invitationId
      inviterName
      organizationName
      role
    }
    ... on RoleChangedNotification {
      organizationName
      role
    }
  }
}`);

export const useNotificationsQuery = <TData = NotificationsQuery, TError = unknown>(
  variables?: NotificationsQueryVariables,
  options?: Omit<UseQueryOptions<NotificationsQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<NotificationsQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<NotificationsQuery, TError, TData>({
    queryKey: variables === undefined ? ["Notifications"] : ["Notifications", variables],
    queryFn: useGraphqlFetcher<NotificationsQuery, NotificationsQueryVariables>(
      NotificationsDocument
    ).bind(null, variables),
    ...options
  });
};

useNotificationsQuery.getKey = (variables?: NotificationsQueryVariables) =>
  variables === undefined ? ["Notifications"] : ["Notifications", variables];

export const MarkNotificationReadDocument = new TypedDocumentString(`
    mutation MarkNotificationRead($id: ID!) {
  markNotificationRead(id: $id) {
    ...NotificationFields
  }
}
    fragment NotificationFields on Notification {
  id
  type
  organizationId
  readAt
  createdAt
  payload {
    __typename
    ... on InvitationReceivedNotification {
      invitationId
      inviterName
      organizationName
      role
    }
    ... on RoleChangedNotification {
      organizationName
      role
    }
  }
}`);

export const useMarkNotificationReadMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    MarkNotificationReadMutation,
    TError,
    MarkNotificationReadMutationVariables,
    TContext
  >
) => {
  return useMutation<
    MarkNotificationReadMutation,
    TError,
    MarkNotificationReadMutationVariables,
    TContext
  >({
    mutationKey: ["MarkNotificationRead"],
    mutationFn: useGraphqlFetcher<
      MarkNotificationReadMutation,
      MarkNotificationReadMutationVariables
    >(MarkNotificationReadDocument),
    ...options
  });
};

useMarkNotificationReadMutation.getKey = () => ["MarkNotificationRead"];

export const MarkAllNotificationsReadDocument = new TypedDocumentString(`
    mutation MarkAllNotificationsRead {
  markAllNotificationsRead
}
    `);

export const useMarkAllNotificationsReadMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    MarkAllNotificationsReadMutation,
    TError,
    MarkAllNotificationsReadMutationVariables,
    TContext
  >
) => {
  return useMutation<
    MarkAllNotificationsReadMutation,
    TError,
    MarkAllNotificationsReadMutationVariables,
    TContext
  >({
    mutationKey: ["MarkAllNotificationsRead"],
    mutationFn: useGraphqlFetcher<
      MarkAllNotificationsReadMutation,
      MarkAllNotificationsReadMutationVariables
    >(MarkAllNotificationsReadDocument),
    ...options
  });
};

useMarkAllNotificationsReadMutation.getKey = () => ["MarkAllNotificationsRead"];

export const OnNotificationReceivedDocument = new TypedDocumentString(`
    subscription OnNotificationReceived {
  notificationReceived {
    ...NotificationFields
  }
}
    fragment NotificationFields on Notification {
  id
  type
  organizationId
  readAt
  createdAt
  payload {
    __typename
    ... on InvitationReceivedNotification {
      invitationId
      inviterName
      organizationName
      role
    }
    ... on RoleChangedNotification {
      organizationName
      role
    }
  }
}`);
export const NotificationPreferencesDocument = new TypedDocumentString(`
    query NotificationPreferences {
  notificationPreferences {
    type
    inApp
    email
    emailAvailable
  }
}
    `);

export const useNotificationPreferencesQuery = <
  TData = NotificationPreferencesQuery,
  TError = unknown
>(
  variables?: NotificationPreferencesQueryVariables,
  options?: Omit<UseQueryOptions<NotificationPreferencesQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<NotificationPreferencesQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<NotificationPreferencesQuery, TError, TData>({
    queryKey:
      variables === undefined
        ? ["NotificationPreferences"]
        : ["NotificationPreferences", variables],
    queryFn: useGraphqlFetcher<NotificationPreferencesQuery, NotificationPreferencesQueryVariables>(
      NotificationPreferencesDocument
    ).bind(null, variables),
    ...options
  });
};

useNotificationPreferencesQuery.getKey = (variables?: NotificationPreferencesQueryVariables) =>
  variables === undefined ? ["NotificationPreferences"] : ["NotificationPreferences", variables];

export const UpdateNotificationPreferenceDocument = new TypedDocumentString(`
    mutation UpdateNotificationPreference($input: NotificationPreferenceInput!) {
  updateNotificationPreference(input: $input) {
    type
    inApp
    email
    emailAvailable
  }
}
    `);

export const useUpdateNotificationPreferenceMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    UpdateNotificationPreferenceMutation,
    TError,
    UpdateNotificationPreferenceMutationVariables,
    TContext
  >
) => {
  return useMutation<
    UpdateNotificationPreferenceMutation,
    TError,
    UpdateNotificationPreferenceMutationVariables,
    TContext
  >({
    mutationKey: ["UpdateNotificationPreference"],
    mutationFn: useGraphqlFetcher<
      UpdateNotificationPreferenceMutation,
      UpdateNotificationPreferenceMutationVariables
    >(UpdateNotificationPreferenceDocument),
    ...options
  });
};

useUpdateNotificationPreferenceMutation.getKey = () => ["UpdateNotificationPreference"];

export const OrganizationPermissionsDocument = new TypedDocumentString(`
    query OrganizationPermissions {
  organizationPermissions
}
    `);

export const useOrganizationPermissionsQuery = <
  TData = OrganizationPermissionsQuery,
  TError = unknown
>(
  variables?: OrganizationPermissionsQueryVariables,
  options?: Omit<UseQueryOptions<OrganizationPermissionsQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<OrganizationPermissionsQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<OrganizationPermissionsQuery, TError, TData>({
    queryKey:
      variables === undefined
        ? ["OrganizationPermissions"]
        : ["OrganizationPermissions", variables],
    queryFn: useGraphqlFetcher<OrganizationPermissionsQuery, OrganizationPermissionsQueryVariables>(
      OrganizationPermissionsDocument
    ).bind(null, variables),
    ...options
  });
};

useOrganizationPermissionsQuery.getKey = (variables?: OrganizationPermissionsQueryVariables) =>
  variables === undefined ? ["OrganizationPermissions"] : ["OrganizationPermissions", variables];

export const GetPublicAssetsDocument = new TypedDocumentString(`
    query GetPublicAssets {
  publicAssets {
    avatarUrl
    organizationLogoUrl
  }
}
    `);

export const useGetPublicAssetsQuery = <TData = GetPublicAssetsQuery, TError = unknown>(
  variables?: GetPublicAssetsQueryVariables,
  options?: Omit<UseQueryOptions<GetPublicAssetsQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<GetPublicAssetsQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<GetPublicAssetsQuery, TError, TData>({
    queryKey: variables === undefined ? ["GetPublicAssets"] : ["GetPublicAssets", variables],
    queryFn: useGraphqlFetcher<GetPublicAssetsQuery, GetPublicAssetsQueryVariables>(
      GetPublicAssetsDocument
    ).bind(null, variables),
    ...options
  });
};

useGetPublicAssetsQuery.getKey = (variables?: GetPublicAssetsQueryVariables) =>
  variables === undefined ? ["GetPublicAssets"] : ["GetPublicAssets", variables];

export const RequestPublicAssetUploadDocument = new TypedDocumentString(`
    mutation RequestPublicAssetUpload($input: RequestPublicAssetUploadInput!) {
  requestPublicAssetUpload(input: $input) {
    uploadUrl
    stagingKey
    expiresIn
  }
}
    `);

export const useRequestPublicAssetUploadMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    RequestPublicAssetUploadMutation,
    TError,
    RequestPublicAssetUploadMutationVariables,
    TContext
  >
) => {
  return useMutation<
    RequestPublicAssetUploadMutation,
    TError,
    RequestPublicAssetUploadMutationVariables,
    TContext
  >({
    mutationKey: ["RequestPublicAssetUpload"],
    mutationFn: useGraphqlFetcher<
      RequestPublicAssetUploadMutation,
      RequestPublicAssetUploadMutationVariables
    >(RequestPublicAssetUploadDocument),
    ...options
  });
};

useRequestPublicAssetUploadMutation.getKey = () => ["RequestPublicAssetUpload"];

export const ConfirmPublicAssetUploadDocument = new TypedDocumentString(`
    mutation ConfirmPublicAssetUpload($kind: PublicAssetKind!, $stagingKey: String!) {
  confirmPublicAssetUpload(kind: $kind, stagingKey: $stagingKey) {
    avatarUrl
    organizationLogoUrl
  }
}
    `);

export const useConfirmPublicAssetUploadMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    ConfirmPublicAssetUploadMutation,
    TError,
    ConfirmPublicAssetUploadMutationVariables,
    TContext
  >
) => {
  return useMutation<
    ConfirmPublicAssetUploadMutation,
    TError,
    ConfirmPublicAssetUploadMutationVariables,
    TContext
  >({
    mutationKey: ["ConfirmPublicAssetUpload"],
    mutationFn: useGraphqlFetcher<
      ConfirmPublicAssetUploadMutation,
      ConfirmPublicAssetUploadMutationVariables
    >(ConfirmPublicAssetUploadDocument),
    ...options
  });
};

useConfirmPublicAssetUploadMutation.getKey = () => ["ConfirmPublicAssetUpload"];

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
    query GetFiles($filter: FilesFilterInput, $first: Int, $after: String) {
  files(filter: $filter, first: $first, after: $after) {
    items {
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
    pageInfo {
      hasNextPage
      endCursor
    }
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
    query GetTodos($first: Int, $after: String, $search: String, $completed: Boolean) {
  todos(first: $first, after: $after, search: $search, completed: $completed) {
    items {
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
        thumbnailUrl
      }
      createdAt
      updatedAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
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
      thumbnailUrl
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

export const TodoCountsDocument = new TypedDocumentString(`
    query TodoCounts {
  todoCounts {
    open
    completed
  }
}
    `);

export const useTodoCountsQuery = <TData = TodoCountsQuery, TError = unknown>(
  variables?: TodoCountsQueryVariables,
  options?: Omit<UseQueryOptions<TodoCountsQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<TodoCountsQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<TodoCountsQuery, TError, TData>({
    queryKey: variables === undefined ? ["TodoCounts"] : ["TodoCounts", variables],
    queryFn: useGraphqlFetcher<TodoCountsQuery, TodoCountsQueryVariables>(TodoCountsDocument).bind(
      null,
      variables
    ),
    ...options
  });
};

useTodoCountsQuery.getKey = (variables?: TodoCountsQueryVariables) =>
  variables === undefined ? ["TodoCounts"] : ["TodoCounts", variables];

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
      thumbnailUrl
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
        thumbnailUrl
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
      thumbnailUrl
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
      thumbnailUrl
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
  }
}
    `);
export const OnTodoUpdatedDocument = new TypedDocumentString(`
    subscription OnTodoUpdated {
  todoUpdated {
    id
  }
}
    `);
export const OnTodoDeletedDocument = new TypedDocumentString(`
    subscription OnTodoDeleted {
  todoDeleted {
    id
  }
}
    `);
export const OnTodoToggledDocument = new TypedDocumentString(`
    subscription OnTodoToggled {
  todoToggled {
    id
  }
}
    `);
export const WebhookEventTypesDocument = new TypedDocumentString(`
    query WebhookEventTypes {
  webhookEventTypes
}
    `);

export const useWebhookEventTypesQuery = <TData = WebhookEventTypesQuery, TError = unknown>(
  variables?: WebhookEventTypesQueryVariables,
  options?: Omit<UseQueryOptions<WebhookEventTypesQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<WebhookEventTypesQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<WebhookEventTypesQuery, TError, TData>({
    queryKey: variables === undefined ? ["WebhookEventTypes"] : ["WebhookEventTypes", variables],
    queryFn: useGraphqlFetcher<WebhookEventTypesQuery, WebhookEventTypesQueryVariables>(
      WebhookEventTypesDocument
    ).bind(null, variables),
    ...options
  });
};

useWebhookEventTypesQuery.getKey = (variables?: WebhookEventTypesQueryVariables) =>
  variables === undefined ? ["WebhookEventTypes"] : ["WebhookEventTypes", variables];

export const WebhookEndpointsDocument = new TypedDocumentString(`
    query WebhookEndpoints($first: Int, $after: String) {
  webhookEndpoints(first: $first, after: $after) {
    items {
      ...WebhookEndpointFields
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    fragment WebhookEndpointFields on WebhookEndpoint {
  id
  url
  eventTypes
  createdAt
  updatedAt
}`);

export const useWebhookEndpointsQuery = <TData = WebhookEndpointsQuery, TError = unknown>(
  variables?: WebhookEndpointsQueryVariables,
  options?: Omit<UseQueryOptions<WebhookEndpointsQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<WebhookEndpointsQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<WebhookEndpointsQuery, TError, TData>({
    queryKey: variables === undefined ? ["WebhookEndpoints"] : ["WebhookEndpoints", variables],
    queryFn: useGraphqlFetcher<WebhookEndpointsQuery, WebhookEndpointsQueryVariables>(
      WebhookEndpointsDocument
    ).bind(null, variables),
    ...options
  });
};

useWebhookEndpointsQuery.getKey = (variables?: WebhookEndpointsQueryVariables) =>
  variables === undefined ? ["WebhookEndpoints"] : ["WebhookEndpoints", variables];

export const WebhookDeliveriesDocument = new TypedDocumentString(`
    query WebhookDeliveries($endpointId: ID!, $first: Int, $after: String) {
  webhookDeliveries(endpointId: $endpointId, first: $first, after: $after) {
    items {
      id
      eventId
      eventType
      attempt
      statusCode
      durationMs
      error
      createdAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    `);

export const useWebhookDeliveriesQuery = <TData = WebhookDeliveriesQuery, TError = unknown>(
  variables: WebhookDeliveriesQueryVariables,
  options?: Omit<UseQueryOptions<WebhookDeliveriesQuery, TError, TData>, "queryKey"> & {
    queryKey?: UseQueryOptions<WebhookDeliveriesQuery, TError, TData>["queryKey"];
  }
) => {
  return useQuery<WebhookDeliveriesQuery, TError, TData>({
    queryKey: ["WebhookDeliveries", variables],
    queryFn: useGraphqlFetcher<WebhookDeliveriesQuery, WebhookDeliveriesQueryVariables>(
      WebhookDeliveriesDocument
    ).bind(null, variables),
    ...options
  });
};

useWebhookDeliveriesQuery.getKey = (variables: WebhookDeliveriesQueryVariables) => [
  "WebhookDeliveries",
  variables
];

export const CreateWebhookEndpointDocument = new TypedDocumentString(`
    mutation CreateWebhookEndpoint($input: WebhookEndpointInput!) {
  createWebhookEndpoint(input: $input) {
    endpoint {
      ...WebhookEndpointFields
    }
    secret
  }
}
    fragment WebhookEndpointFields on WebhookEndpoint {
  id
  url
  eventTypes
  createdAt
  updatedAt
}`);

export const useCreateWebhookEndpointMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    CreateWebhookEndpointMutation,
    TError,
    CreateWebhookEndpointMutationVariables,
    TContext
  >
) => {
  return useMutation<
    CreateWebhookEndpointMutation,
    TError,
    CreateWebhookEndpointMutationVariables,
    TContext
  >({
    mutationKey: ["CreateWebhookEndpoint"],
    mutationFn: useGraphqlFetcher<
      CreateWebhookEndpointMutation,
      CreateWebhookEndpointMutationVariables
    >(CreateWebhookEndpointDocument),
    ...options
  });
};

useCreateWebhookEndpointMutation.getKey = () => ["CreateWebhookEndpoint"];

export const UpdateWebhookEndpointDocument = new TypedDocumentString(`
    mutation UpdateWebhookEndpoint($id: ID!, $input: WebhookEndpointInput!) {
  updateWebhookEndpoint(id: $id, input: $input) {
    ...WebhookEndpointFields
  }
}
    fragment WebhookEndpointFields on WebhookEndpoint {
  id
  url
  eventTypes
  createdAt
  updatedAt
}`);

export const useUpdateWebhookEndpointMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    UpdateWebhookEndpointMutation,
    TError,
    UpdateWebhookEndpointMutationVariables,
    TContext
  >
) => {
  return useMutation<
    UpdateWebhookEndpointMutation,
    TError,
    UpdateWebhookEndpointMutationVariables,
    TContext
  >({
    mutationKey: ["UpdateWebhookEndpoint"],
    mutationFn: useGraphqlFetcher<
      UpdateWebhookEndpointMutation,
      UpdateWebhookEndpointMutationVariables
    >(UpdateWebhookEndpointDocument),
    ...options
  });
};

useUpdateWebhookEndpointMutation.getKey = () => ["UpdateWebhookEndpoint"];

export const DeleteWebhookEndpointDocument = new TypedDocumentString(`
    mutation DeleteWebhookEndpoint($id: ID!) {
  deleteWebhookEndpoint(id: $id)
}
    `);

export const useDeleteWebhookEndpointMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    DeleteWebhookEndpointMutation,
    TError,
    DeleteWebhookEndpointMutationVariables,
    TContext
  >
) => {
  return useMutation<
    DeleteWebhookEndpointMutation,
    TError,
    DeleteWebhookEndpointMutationVariables,
    TContext
  >({
    mutationKey: ["DeleteWebhookEndpoint"],
    mutationFn: useGraphqlFetcher<
      DeleteWebhookEndpointMutation,
      DeleteWebhookEndpointMutationVariables
    >(DeleteWebhookEndpointDocument),
    ...options
  });
};

useDeleteWebhookEndpointMutation.getKey = () => ["DeleteWebhookEndpoint"];

export const RotateWebhookSecretDocument = new TypedDocumentString(`
    mutation RotateWebhookSecret($id: ID!) {
  rotateWebhookSecret(id: $id)
}
    `);

export const useRotateWebhookSecretMutation = <TError = unknown, TContext = unknown>(
  options?: UseMutationOptions<
    RotateWebhookSecretMutation,
    TError,
    RotateWebhookSecretMutationVariables,
    TContext
  >
) => {
  return useMutation<
    RotateWebhookSecretMutation,
    TError,
    RotateWebhookSecretMutationVariables,
    TContext
  >({
    mutationKey: ["RotateWebhookSecret"],
    mutationFn: useGraphqlFetcher<
      RotateWebhookSecretMutation,
      RotateWebhookSecretMutationVariables
    >(RotateWebhookSecretDocument),
    ...options
  });
};

useRotateWebhookSecretMutation.getKey = () => ["RotateWebhookSecret"];
