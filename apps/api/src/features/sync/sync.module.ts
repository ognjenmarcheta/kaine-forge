import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import type { SyncMutationOutcome, SyncTombstone } from "@repo/db";
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
  SyncDeletion,
  SyncedRows,
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
import { createScopedData, type OrganizationOwnedTable, type ScopedData } from "../../context.data";
import type { NoteModuleDeps, Notes } from "../notes/notes.module";
import type { Todos } from "../todos/todos.module";

type Publish = NoteModuleDeps["publish"];

/** The modules of the synced entities, over one mutation's savepoint. */
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
   * Applies the mutations in order, each in its own savepoint, through each
   * entity's own module. A mutation a module refuses is REJECTED and the
   * rest still apply; any other error fails the whole push for the client to
   * retry. Events publish after commit. A repeated idempotency key returns the
   * first push's results and applies nothing.
   */
  push: (input: SyncPushInput) => Promise<SyncPushPayload>;
}

const APPLIED: SyncMutationOutcome = { status: "APPLIED", code: null };

/** A table a pull reads: its rows carry a Sync Version. */
type SyncedTable = OrganizationOwnedTable & { syncVersion: AnyColumn };

/** The table behind each SyncedRows field. */
const SYNCED_TABLES = {
  todos: todosTable,
  notes: notesTable
} satisfies { [Field in keyof SyncedRows]: SyncedTable };

// SAFETY: the keys of SYNCED_TABLES, whose type allows exactly the SyncedRows fields.
const SYNCED_FIELDS = Object.keys(SYNCED_TABLES) as Array<keyof SyncedRows>;

type SyncedRow = SyncedRows[keyof SyncedRows][number];

type Change =
  | { syncVersion: number; field: keyof SyncedRows; row: SyncedRow }
  | { syncVersion: number; deleted: SyncDeletion };

/** Each SyncedRows field with the rows among `changes` read from its table. */
function rowsByField(changes: readonly Change[]): SyncedRows {
  const rows: Partial<Record<keyof SyncedRows, SyncedRow[]>> = {};
  for (const field of SYNCED_FIELDS) {
    rows[field] = changes.flatMap((change) =>
      "field" in change && change.field === field ? [change.row] : []
    );
  }
  // SAFETY: one entry per SyncedRows field, holding only rows read from that field's table.
  return rows as SyncedRows;
}

const RESET: SyncPullPayload = {
  ...rowsByField([]),
  deleted: [],
  cursor: null,
  hasMore: false,
  resetRequired: true
};

function deletionEntity(entity: SyncTombstone["entity"]): SyncDeletion["entity"] {
  // SAFETY: toUpperCase maps a sync_entity value to exactly its Uppercase<> form.
  return entity.toUpperCase() as SyncDeletion["entity"];
}

function clampLimit(first: number | null | undefined): number {
  const { defaultLimit, maxLimit } = SYNC_CONFIG.pull;
  return Math.min(maxLimit, Math.max(1, Math.floor(first ?? defaultLimit)));
}

function within(column: AnyColumn, after: number, head: number) {
  return and(gt(column, after), lte(column, head));
}

async function ensureNotDeleted(
  data: ScopedData,
  entity: SyncTombstone["entity"],
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

type MutationInputs = {
  [Field in keyof SyncMutationInput]-?: NonNullable<SyncMutationInput[Field]>;
};

type MutationHandlers = {
  [Field in keyof MutationInputs]: (
    input: MutationInputs[Field],
    writers: SyncWriters,
    data: ScopedData
  ) => Promise<unknown>;
};

/**
 * How a push applies each SyncMutationInput field, through the entity's own
 * module. An update passes only the fields the client sent: GraphQL omits the
 * rest, and null clears an optional text but never a title or completion.
 */
const MUTATIONS: MutationHandlers = {
  async todoCreate({ id, title, description, noteId }, { todos }, data) {
    await ensureNotDeleted(data, "todo", ensureUuid(id));
    await todos.create({
      id,
      title,
      description: description ?? null,
      noteId: noteId == null ? null : ensureUuid(noteId)
    });
  },
  async todoUpdate({ id, ...fields }, { todos }) {
    await todos.update(ensureUuid(id), {
      ...("description" in fields ? { description: fields.description ?? null } : {}),
      ...(typeof fields.title === "string" ? { title: fields.title } : {}),
      ...(typeof fields.completed === "boolean" ? { completed: fields.completed } : {})
    });
  },
  async todoDelete({ id }, { todos }) {
    await todos.delete(ensureUuid(id));
  },
  async noteCreate({ id, title, body }, { notes }, data) {
    await ensureNotDeleted(data, "note", ensureUuid(id));
    await notes.create({ id, title, body: body ?? null });
  },
  async noteUpdate({ id, ...fields }, { notes }) {
    await notes.update(ensureUuid(id), {
      ...("body" in fields ? { body: fields.body ?? null } : {}),
      ...(typeof fields.title === "string" ? { title: fields.title } : {})
    });
  },
  async noteDelete({ id }, { notes }) {
    await notes.delete(ensureUuid(id));
  }
};

// SAFETY: the keys of MUTATIONS, whose type requires exactly the SyncMutationInput fields.
const MUTATION_FIELDS = Object.keys(MUTATIONS) as Array<keyof MutationInputs>;

function applyField<Field extends keyof MutationInputs>(
  field: Field,
  input: MutationInputs[Field],
  writers: SyncWriters,
  data: ScopedData
): Promise<unknown> {
  return MUTATIONS[field](input, writers, data);
}

async function applyMutation(
  data: ScopedData,
  writers: SyncWriters,
  mutation: SyncMutationInput
): Promise<void> {
  // `@oneOf` lets exactly one field through.
  for (const field of MUTATION_FIELDS) {
    const input = mutation[field];
    if (input) {
      await applyField(field, input, writers, data);
      return;
    }
  }
  throw new Error("invalid id");
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
      const [rows, tombstones] = await Promise.all([
        Promise.all(
          SYNCED_FIELDS.map(async (field) => {
            const table = SYNCED_TABLES[field];
            const found: SyncedRow[] = await data
              .selectFrom(table, within(table.syncVersion, after, head))
              .orderBy(asc(table.syncVersion))
              .limit(limit + 1);
            return found.map((row): Change => ({ syncVersion: row.syncVersion, field, row }));
          })
        ),
        data
          .selectFrom(
            syncTombstonesTable,
            within(syncTombstonesTable.syncVersion, Math.max(after, floor), head)
          )
          .orderBy(asc(syncTombstonesTable.syncVersion))
          .limit(limit + 1)
      ]);
      const changes: Change[] = [
        ...rows.flat(),
        ...tombstones.map((tombstone) => ({
          syncVersion: tombstone.syncVersion,
          deleted: { entity: deletionEntity(tombstone.entity), id: tombstone.entityId }
        }))
      ].sort((a, b) => a.syncVersion - b.syncVersion);
      const page = changes.slice(0, limit);
      const hasMore = changes.length > limit;
      const version = hasMore ? (page.at(-1)?.syncVersion ?? after) : head;

      return {
        ...rowsByField(page),
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
