import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";
import type { SyncMutationOutcome } from "../types/sync.type";

/** The synced entities: each has a `sync_version` column and a delete trigger. */
export const syncEntityEnum = pgEnum("sync_entity", ["todo", "note"]);

/**
 * One counter per Organization. A trigger raises it on every write to a synced
 * table and stamps the row with the new value, so each change in the
 * Organization gets its own Sync Version. The trigger's row lock orders writes
 * in one Organization: a version is visible only when every lower one is.
 */
export const organizationSyncVersionsTable = pgTable("organization_sync_versions", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  version: bigint("version", { mode: "number" }).notNull().default(0),
  /** The highest Sync Version of a Tombstone housekeeping removed. */
  prunedThrough: bigint("pruned_through", { mode: "number" }).notNull().default(0)
});

/** A deleted synced row, written by its table's delete trigger. */
export const syncTombstonesTable = pgTable(
  "sync_tombstones",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    entity: syncEntityEnum("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    syncVersion: bigint("sync_version", { mode: "number" }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.entity, table.entityId] }),
    index("sync_tombstones_organization_id_sync_version_idx").on(
      table.organizationId,
      table.syncVersion
    ),
    index("sync_tombstones_deleted_at_idx").on(table.deletedAt)
  ]
);

/**
 * One applied sync push per idempotency key, so a push the client retries
 * after a lost response is answered from here instead of applied twice.
 */
export const syncMutationReceiptsTable = pgTable(
  "sync_mutation_receipts",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    /** The push's per-mutation results; null only inside the push's own transaction. */
    result: jsonb("result").$type<SyncMutationOutcome[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId, table.idempotencyKey] }),
    index("sync_mutation_receipts_created_at_idx").on(table.createdAt)
  ]
);
