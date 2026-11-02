import type { SyncMutation, SyncNotePatch, SyncTodoPatch } from "./sync.type";

/** The session cannot make the request: it expired or was signed out. */
export class SyncAuthError extends Error {
  override name = "SyncAuthError";
}

/** The server refused the request as a whole; resending it cannot succeed. */
export class SyncRequestError extends Error {
  override name = "SyncRequestError";
}

export type SyncEntity = "TODO" | "NOTE";

/** One local change as the Outbox holds it: the rows are plain records there. */
export interface SyncChange {
  entity: SyncEntity;
  type: "insert" | "update" | "delete";
  key: string;
  modified: Record<string, unknown>;
  changes: Record<string, unknown>;
  /** The row before this change, with every earlier local change applied. */
  original: Record<string, unknown>;
}

function text(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new Error(`a synced row has no ${field}`);
  return value;
}

function optionalText(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  return typeof value === "string" ? value : null;
}

/** The fields an update changed, each only when it was changed. */
function todoPatch(changes: Record<string, unknown>): SyncTodoPatch {
  const { title, description, completed } = changes;
  return {
    ...(typeof title === "string" ? { title } : {}),
    ...("description" in changes
      ? { description: typeof description === "string" ? description : null }
      : {}),
    ...(typeof completed === "boolean" ? { completed } : {})
  };
}

/**
 * A body edit also sends the body it started from, so the server can merge it
 * into a body another device changed since. The server applies a device's
 * changes in order, so the body before this change is what it started from.
 */
function notePatch(
  changes: Record<string, unknown>,
  original: Record<string, unknown>
): SyncNotePatch & { baseBody?: string | null } {
  const { title, body } = changes;
  return {
    ...(typeof title === "string" ? { title } : {}),
    ...("body" in changes
      ? { body: typeof body === "string" ? body : null, baseBody: optionalText(original, "body") }
      : {})
  };
}

/**
 * The `syncPush` mutation for one local change. An update sends only the
 * fields the user changed, so the server patches those fields alone.
 */
export function toSyncMutation({
  entity,
  type,
  key,
  modified,
  changes,
  original
}: SyncChange): SyncMutation {
  if (entity === "TODO") {
    if (type === "delete") return { todoDelete: { id: key } };
    if (type === "update") return { todoUpdate: { id: key, ...todoPatch(changes) } };
    return {
      todoCreate: {
        id: key,
        title: text(modified, "title"),
        description: optionalText(modified, "description"),
        noteId: optionalText(modified, "noteId")
      }
    };
  }

  if (type === "delete") return { noteDelete: { id: key } };
  if (type === "update") return { noteUpdate: { id: key, ...notePatch(changes, original) } };
  return {
    noteCreate: { id: key, title: text(modified, "title"), body: optionalText(modified, "body") }
  };
}
