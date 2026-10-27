import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";

/** Whose data an export holds: the requester's own, or the Active Organization's. */
export const dataExportKindEnum = pgEnum("data_export_kind", ["user", "organization"]);

export const dataExportStatusEnum = pgEnum("data_export_status", [
  "pending",
  "running",
  "ready",
  "failed",
  "expired"
]);

/**
 * One requested data export and its archive in the private bucket. A job
 * builds the archive; retention deletes the archive at `expires_at` and the
 * row after its own window.
 */
export const dataExportsTable = pgTable(
  "data_exports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: dataExportKindEnum("kind").notNull(),
    status: dataExportStatusEnum("status").notNull().default("pending"),
    // The requester. Null once they deleted their account: retention then
    // deletes the archive of their own export at its next run.
    userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    // The exported Organization; null for a user export. An Organization
    // delete removes the row, and the storage sweep removes its archive with
    // the Organization's prefix.
    organizationId: uuid("organization_id").references(() => organizationsTable.id, {
      onDelete: "cascade"
    }),
    /** The archive object; set while the export is ready. */
    bucket: text("bucket"),
    key: text("key"),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** When retention deletes the archive; set when the export is ready. */
    expiresAt: timestamp("expires_at", { withTimezone: true })
  },
  (table) => [
    // At most one pending or running export of each kind per requester.
    uniqueIndex("data_exports_user_id_kind_in_progress_unique")
      .on(table.userId, table.kind)
      .where(sql`${table.status} in ('pending', 'running')`),
    // A user reads their own exports newest first.
    index("data_exports_user_id_created_at_idx").on(table.userId, table.createdAt)
  ]
);
