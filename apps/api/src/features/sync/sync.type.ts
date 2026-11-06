import type { Note, SyncMutationOutcome, SyncTombstone, Todo } from "@repo/db";

export interface SyncPullArgs {
  cursor?: string | null | undefined;
  first?: number | null | undefined;
  /**
   * On a first pull, the newest rows of each list to return instead of every
   * row; the rest load through `syncPullOlder`.
   */
  window?: number | null | undefined;
}

export interface SyncPullOlderArgs {
  after: string;
  first?: number | null | undefined;
}

/** Rows older than a payload returned, for one of its lists. */
export interface SyncOlder {
  /** The payload field the older rows load into, such as `todos`. */
  list: keyof SyncedRows;
  after: string;
}

export interface SyncDeletion {
  /** The Tombstone's `sync_entity` value in upper case, as the `SyncEntity` enum names it. */
  entity: Uppercase<SyncTombstone["entity"]>;
  id: string;
}

/** The changed rows of a pull, one field per synced table. */
export interface SyncedRows {
  todos: Todo[];
  notes: Note[];
}

/**
 * The changes after a cursor, oldest first. `cursor` is null only when
 * `resetRequired` is true: the client then drops its local rows and pulls
 * again without a cursor.
 */
export interface SyncPullPayload extends SyncedRows {
  deleted: SyncDeletion[];
  cursor: string | null;
  hasMore: boolean;
  resetRequired: boolean;
  older: SyncOlder[];
}

export interface SyncTodoCreate {
  id: string;
  title: string;
  description?: string | null;
  noteId?: string | null;
}

export interface SyncTodoUpdate {
  id: string;
  title?: string | null;
  description?: string | null;
  completed?: boolean | null;
}

export interface SyncNoteCreate {
  id: string;
  title: string;
  body?: string | null;
}

export interface SyncNoteUpdate {
  id: string;
  title?: string | null;
  body?: string | null;
  baseBody?: string | null;
}

export interface SyncDelete {
  id: string;
}

/** A `@oneOf` input: GraphQL validation lets exactly one field through. */
export interface SyncMutationInput {
  todoCreate?: SyncTodoCreate | null;
  todoUpdate?: SyncTodoUpdate | null;
  todoDelete?: SyncDelete | null;
  noteCreate?: SyncNoteCreate | null;
  noteUpdate?: SyncNoteUpdate | null;
  noteDelete?: SyncDelete | null;
}

export interface SyncPushInput {
  idempotencyKey: string;
  mutations: SyncMutationInput[];
}

export interface SyncPushPayload {
  results: SyncMutationOutcome[];
}
