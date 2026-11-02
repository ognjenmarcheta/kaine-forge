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
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { SYNC_CONFIG } from "./sync.config";
import { mergeText } from "./sync.merge";
import type {
  SyncDeletion,
  SyncedRows,
  SyncMutationInput,
  SyncOlder,
  SyncPullArgs,
  SyncPullOlderArgs,
  SyncPullPayload,
  SyncPushInput,
  SyncPushPayload
} from "./sync.type";
import {
  decodeOlderCursor,
  decodeSyncCursor,
  encodeOlderCursor,
  encodeSyncCursor,
  ensureIdempotencyKey,
  ensureUuid,
  rejectionCode
} from "./sync.util";
import {
  createScopedData,
  type Connection,
  type OrganizationOwnedTable,
  type PageOrder,
  type ScopedData
} from "../../context.data";
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
  /**
   * A malformed or foreign cursor throws `invalid cursor`. A first pull with a
   * `window` returns only the newest rows of each list, and `older` names
   * where the rest continue; every later change of any row still follows.
   */
  pull: (args: SyncPullArgs) => Promise<SyncPullPayload>;
  /** The next older rows of one list, from a `SyncOlder` cursor. */
  pullOlder: (args: SyncPullOlderArgs) => Promise<SyncPullPayload>;
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

/** A table a pull reads: its rows carry a Sync Version, and its lists page newest first. */
type SyncedTable = OrganizationOwnedTable & {
  syncVersion: AnyColumn;
  id: AnyPgColumn;
  createdAt: AnyPgColumn;
};

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
  resetRequired: true,
  older: []
};

/** The order the clients list rows in, so older rows load below the ones shown. */
function newestFirst(table: SyncedTable, limits: PageOrder["limits"]): PageOrder {
  return { orderBy: table.createdAt, direction: "desc", limits };
}

/** A page of one list's rows as pull changes, and where its older rows continue. */
function listPage(
  field: keyof SyncedRows,
  page: Connection<SyncedRow>
): { changes: Change[]; older: SyncOlder[] } {
  const { hasNextPage, endCursor } = page.pageInfo;
  return {
    changes: page.items.map((row) => ({ syncVersion: row.syncVersion, field, row })),
    older:
      hasNextPage && endCursor ? [{ list: field, after: encodeOlderCursor(field, endCursor) }] : []
  };
}

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
  async noteUpdate({ id, baseBody, ...fields }, { notes }, data) {
    const noteId = ensureUuid(id);
    let body = fields.body ?? null;
    if ("body" in fields && baseBody !== undefined) {
      // Locked until the push commits, so a concurrent push merges into this result.
      const [current] = await data
        .selectFrom(notesTable, eq(notesTable.id, noteId))
        .for("update")
        .limit(1);
      if (current) {
        const merged = mergeText(baseBody ?? "", current.body ?? "", body ?? "");
        if (merged === null) throw new Error("note body conflict");
        body = merged.length > 0 ? merged : null;
      }
    }
    await notes.update(noteId, {
      ...("body" in fields ? { body } : {}),
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
    async pull(args) {
      const { cursor, first } = args;
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

      if (!position && args.window != null) {
        // Only the newest rows now: any row's later change still follows from `head`.
        const lists = await Promise.all(
          SYNCED_FIELDS.map(async (field) => {
            const table = SYNCED_TABLES[field];
            const page: Connection<SyncedRow> = await data.page(
              table,
              { first: args.window },
              newestFirst(table, SYNC_CONFIG.window)
            );
            return listPage(field, page);
          })
        );
        return {
          ...rowsByField(lists.flatMap((list) => list.changes)),
          deleted: [],
          cursor: encodeSyncCursor(organizationId, { version: head, floor: head }),
          hasMore: false,
          resetRequired: false,
          older: lists.flatMap((list) => list.older)
        };
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
        resetRequired: false,
        older: []
      };
    },

    async pullOlder({ after, first }) {
      // The session first: a request without one learns nothing about the cursor.
      requireOrganizationScope();
      const { list, after: pageCursor } = decodeOlderCursor(after, SYNCED_FIELDS);
      const table = SYNCED_TABLES[list];
      // The page cursor names its table and Organization: a foreign one is refused.
      const page: Connection<SyncedRow> = await data.page(
        table,
        { first, after: pageCursor },
        newestFirst(table, SYNC_CONFIG.older)
      );
      const older = listPage(list, page);
      return {
        ...rowsByField(older.changes),
        deleted: [],
        cursor: null,
        hasMore: false,
        resetRequired: false,
        older: older.older
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
