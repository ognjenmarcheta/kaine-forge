/** An Attachment of a synced Todo: its metadata only. Its URLs expire, so they are never stored. */
export interface SyncAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

/** A Todo as the client stores it: the `syncPull` selection every client asks for. */
export interface SyncTodo {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  noteId: string | null;
  attachments: SyncAttachment[];
  createdAt: string;
  updatedAt: string;
}

/** A Note as the client stores it. */
export interface SyncNote {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncDeletion {
  entity: "TODO" | "NOTE";
  id: string;
}

/** One `syncPull` page. */
export interface SyncPullPage {
  todos: SyncTodo[];
  notes: SyncNote[];
  deleted: SyncDeletion[];
  cursor: string | null;
  hasMore: boolean;
  resetRequired: boolean;
}

export interface SyncTodoPatch {
  title?: string;
  description?: string | null;
  completed?: boolean;
}

export interface SyncNotePatch {
  title?: string;
  body?: string | null;
}

/** One `SyncMutationInput`: exactly one operation, as the `@oneOf` input takes it. */
export type SyncMutation =
  | {
      todoCreate: { id: string; title: string; description: string | null; noteId: string | null };
    }
  | { todoUpdate: SyncTodoPatch & { id: string } }
  | { todoDelete: { id: string } }
  | { noteCreate: { id: string; title: string; body: string | null } }
  | { noteUpdate: SyncNotePatch & { id: string } }
  | { noteDelete: { id: string } };

export type SyncRejectionCode =
  "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "PLAN_LIMIT_REACHED";

export interface SyncMutationOutcome {
  status: "APPLIED" | "REJECTED";
  code: SyncRejectionCode | null;
}

/**
 * How a client reaches the API. Each app builds it on its own generated
 * GraphQL documents. A request the session cannot make throws
 * `SyncAuthError`; one the server refuses as a whole throws
 * `SyncRequestError`. Any other error counts as a network failure and retries.
 */
export interface SyncTransport {
  pull: (cursor: string | null) => Promise<SyncPullPage>;
  push: (idempotencyKey: string, mutations: SyncMutation[]) => Promise<SyncMutationOutcome[]>;
}

/**
 * - `online`: nothing waits to sync.
 * - `offline`: the device has no network; changes are kept on the device.
 * - `syncing`: Pending Changes are sending, or a pull runs.
 * - `error`: the last pull failed while the device looked online.
 * - `signedOut`: the session expired; Pending Changes wait for a new sign-in.
 */
export type SyncState = "online" | "offline" | "syncing" | "error" | "signedOut";

export interface SyncStatus {
  state: SyncState;
  /** Pending Changes in this device's Outbox. */
  pending: number;
}

/** A Pending Change the server refused. The client already rolled it back. */
export interface SyncRejection {
  entity: "TODO" | "NOTE";
  id: string;
  code: SyncRejectionCode;
}
