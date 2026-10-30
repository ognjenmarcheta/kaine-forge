import type { Note, SyncMutationOutcome, Todo } from "@repo/db";

export interface SyncPullArgs {
  cursor?: string | null | undefined;
  first?: number | null | undefined;
}

export interface SyncDeletion {
  entity: "TODO" | "NOTE";
  id: string;
}

/**
 * The changes after a cursor, oldest first. `cursor` is null only when
 * `resetRequired` is true: the client then drops its local rows and pulls
 * again without a cursor.
 */
export interface SyncPullPayload {
  todos: Todo[];
  notes: Note[];
  deleted: SyncDeletion[];
  cursor: string | null;
  hasMore: boolean;
  resetRequired: boolean;
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
