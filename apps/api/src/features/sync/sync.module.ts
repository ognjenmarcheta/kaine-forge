import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import type { SyncMutationOutcome } from "@repo/db";
import {
  notesTable,
  organizationSyncVersionsTable,
  syncMutationReceiptsTable,
  syncTombstonesTable,
  todosTable
} from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { and, asc, eq, gt, lte, type AnyColumn } from "drizzle-orm";

import { SYNC_CONFIG } from "./sync.config";
import type {
  SyncMutationInput,
  SyncPullArgs,
  SyncPullPayload,
  SyncPushInput,
  SyncPushPayload
} from "./sync.type";
import {
  decodeSyncCursor,
  encodeSyncCursor,
  ensureIdempotencyKey,
  ensureUuid,
  rejectionCode
} from "./sync.util";
import { createScopedData, type ScopedData } from "../../context.data";
import type { NoteModuleDeps, Notes } from "../notes/notes.module";
import type { Todos } from "../todos/todos.module";

type Publish = NoteModuleDeps["publish"];

/** The Todo and Note modules over one mutation's savepoint. */
export interface SyncWriters {
  todos: Todos;
  notes: Notes;
}

export interface SyncModuleDeps {
  db: Database;
  /** This request's data, for pulls. */
  data: ScopedData;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
  publish: Publish;
  /**
   * Builds the writers over a savepoint's data. `publish` and `defer` hold
   * their work until the push commits, and drop it if the mutation rolls back.
   */
  createWriters: (input: {
    data: ScopedData;
    publish: Publish;
    defer: (task: () => Promise<void>) => void;
  }) => SyncWriters;
}

/**
 * Offline sync for Todos and Notes in one request's Authenticated
 * Organization Scope. A pull returns the changes after a cursor in Sync
 * Version order; a push applies an Outbox batch once per idempotency key.
 */
export interface Sync {
  /** A malformed or foreign cursor throws `invalid cursor`. */
  pull: (args: SyncPullArgs) => Promise<SyncPullPayload>;
  /**
   * Applies the mutations in order, each in its own savepoint, through the
   * Todo and Note modules. A mutation those modules refuse is REJECTED and the
   * rest still apply; any other error fails the whole push for the client to
   * retry. Events publish after commit. A repeated idempotency key returns the
   * first push's results and applies nothing.
   */
  push: (input: SyncPushInput) => Promise<SyncPushPayload>;
}

const RESET: SyncPullPayload = {
  todos: [],
  notes: [],
  deleted: [],
  cursor: null,
  hasMore: false,
  resetRequired: true
};

const APPLIED: SyncMutationOutcome = { status: "APPLIED", code: null };

type Change =
  | { syncVersion: number; todo: SyncPullPayload["todos"][number] }
  | { syncVersion: number; note: SyncPullPayload["notes"][number] }
  | { syncVersion: number; deleted: SyncPullPayload["deleted"][number] };

function clampLimit(first: number | null | undefined): number {
  const { defaultLimit, maxLimit } = SYNC_CONFIG.pull;
  return Math.min(maxLimit, Math.max(1, Math.floor(first ?? defaultLimit)));
}

function within(column: AnyColumn, after: number, head: number) {
  return and(gt(column, after), lte(column, head));
}

async function ensureNotDeleted(
  data: ScopedData,
  entity: "todo" | "note",
  id: string
): Promise<void> {
  const tombstones = await data
    .selectFrom(
      syncTombstonesTable,
      eq(syncTombstonesTable.entity, entity),
      eq(syncTombstonesTable.entityId, id)
    )
    .limit(1);
  // Delete wins: an id that was deleted is never created again.
  if (tombstones[0]) throw new Error(`${entity} not found`);
}

async function applyMutation(
  data: ScopedData,
  { todos, notes }: SyncWriters,
  mutation: SyncMutationInput
): Promise<void> {
  if (mutation.todoCreate) {
    const { id, title, description, noteId } = mutation.todoCreate;
    await ensureNotDeleted(data, "todo", ensureUuid(id));
    await todos.create({
      id,
      title,
      description: description ?? null,
      noteId: noteId == null ? null : ensureUuid(noteId)
    });
  } else if (mutation.todoUpdate) {
    // Only the fields the client sent: GraphQL omits the rest, and null
    // clears a description but never a title or completion.
    const { id, ...fields } = mutation.todoUpdate;
    await todos.update(ensureUuid(id), {
      ...("description" in fields ? { description: fields.description ?? null } : {}),
      ...(typeof fields.title === "string" ? { title: fields.title } : {}),
      ...(typeof fields.completed === "boolean" ? { completed: fields.completed } : {})
    });
  } else if (mutation.todoDelete) {
    await todos.delete(ensureUuid(mutation.todoDelete.id));
  } else if (mutation.noteCreate) {
    const { id, title, body } = mutation.noteCreate;
    await ensureNotDeleted(data, "note", ensureUuid(id));
    await notes.create({ id, title, body: body ?? null });
  } else if (mutation.noteUpdate) {
    const { id, ...fields } = mutation.noteUpdate;
    await notes.update(ensureUuid(id), {
      ...("body" in fields ? { body: fields.body ?? null } : {}),
      ...(typeof fields.title === "string" ? { title: fields.title } : {})
    });
  } else if (mutation.noteDelete) {
    await notes.delete(ensureUuid(mutation.noteDelete.id));
  } else {
    throw new Error("invalid id");
  }
}

export function createSync({
  db,
  data,
  requireOrganizationScope,
  publish,
  createWriters
}: SyncModuleDeps): Sync {
  return {
    async pull({ cursor, first }) {
      const { organizationId } = data.stamp();
      const position = cursor == null ? null : decodeSyncCursor(cursor, organizationId);
      const [state] = await data.selectFrom(organizationSyncVersionsTable).limit(1);
      // Every version up to `head` has committed: the counter's row lock
      // makes later writers wait, so nothing below it can still appear.
      const head = state?.version ?? 0;

      if (
        position &&
        // Ahead of the server (a restored backup) or behind removed Tombstones.
        (position.version > head ||
          (state?.prunedThrough ?? 0) > Math.max(position.version, position.floor))
      ) {
        return RESET;
      }

      const after = position?.version ?? 0;
      const floor = position?.floor ?? head;
      const limit = clampLimit(first);
      // Each list reads one past the limit: the first `limit` changes overall
      // are among the first `limit` of their own list.
      const [todoRows, noteRows, tombstones] = await Promise.all([
        data
          .selectFrom(todosTable, within(todosTable.syncVersion, after, head))
          .orderBy(asc(todosTable.syncVersion))
          .limit(limit + 1),
        data
          .selectFrom(notesTable, within(notesTable.syncVersion, after, head))
          .orderBy(asc(notesTable.syncVersion))
          .limit(limit + 1),
        data
          .selectFrom(
            syncTombstonesTable,
            within(syncTombstonesTable.syncVersion, Math.max(after, floor), head)
          )
          .orderBy(asc(syncTombstonesTable.syncVersion))
          .limit(limit + 1)
      ]);
      const changes: Change[] = [
        ...todoRows.map((todo) => ({ syncVersion: todo.syncVersion, todo })),
        ...noteRows.map((note) => ({ syncVersion: note.syncVersion, note })),
        ...tombstones.map((tombstone) => ({
          syncVersion: tombstone.syncVersion,
          deleted: {
            entity: tombstone.entity === "todo" ? ("TODO" as const) : ("NOTE" as const),
            id: tombstone.entityId
          }
        }))
      ].sort((a, b) => a.syncVersion - b.syncVersion);
      const page = changes.slice(0, limit);
      const hasMore = changes.length > limit;
      const version = hasMore ? (page.at(-1)?.syncVersion ?? after) : head;

      return {
        todos: page.flatMap((change) => ("todo" in change ? [change.todo] : [])),
        notes: page.flatMap((change) => ("note" in change ? [change.note] : [])),
        deleted: page.flatMap((change) => ("deleted" in change ? [change.deleted] : [])),
        cursor: encodeSyncCursor(organizationId, { version, floor }),
        hasMore,
        resetRequired: false
      };
    },

    async push({ idempotencyKey, mutations }) {
      const scope = requireOrganizationScope();
      ensureIdempotencyKey(idempotencyKey, SYNC_CONFIG.maxIdempotencyKeyLength);
      if (mutations.length > SYNC_CONFIG.maxPushMutations) {
        throw new Error(`a push carries at most ${SYNC_CONFIG.maxPushMutations} mutations`);
      }

      const receipt = and(
        eq(syncMutationReceiptsTable.organizationId, scope.organizationId),
        eq(syncMutationReceiptsTable.userId, scope.userId),
        eq(syncMutationReceiptsTable.idempotencyKey, idempotencyKey)
      );
      const committed: Array<() => Promise<void> | void> = [];

      const results = await db.transaction(async (tx) => {
        // A concurrent push with the same key waits on this row until the
        // first commits, then reads its results below.
        const claimed = await tx
          .insert(syncMutationReceiptsTable)
          .values({
            organizationId: scope.organizationId,
            userId: scope.userId,
            idempotencyKey
          })
          .onConflictDoNothing()
          .returning({ key: syncMutationReceiptsTable.idempotencyKey });

        if (!claimed[0]) {
          const [stored] = await tx
            .select({ result: syncMutationReceiptsTable.result })
            .from(syncMutationReceiptsTable)
            .where(receipt)
            .limit(1);
          return stored?.result ?? [];
        }

        const outcomes: SyncMutationOutcome[] = [];
        for (const mutation of mutations) {
          const pending: Array<() => Promise<void> | void> = [];
          try {
            await tx.transaction(async (savepoint) => {
              const savepointData = createScopedData({ db: savepoint, requireOrganizationScope });
              const writers = createWriters({
                data: savepointData,
                publish: (eventName, ...payload) => {
                  pending.push(() => publish(eventName, ...payload));
                },
                defer: (task) => {
                  pending.push(task);
                }
              });
              await applyMutation(savepointData, writers, mutation);
            });
            committed.push(...pending);
            outcomes.push(APPLIED);
          } catch (error) {
            const code = rejectionCode(error);
            if (!code) throw error;
            outcomes.push({ status: "REJECTED", code });
          }
        }

        await tx.update(syncMutationReceiptsTable).set({ result: outcomes }).where(receipt);
        return outcomes;
      });

      for (const task of committed) {
        void task();
      }
      return { results };
    }
  };
}
