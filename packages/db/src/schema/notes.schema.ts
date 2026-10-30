import { bigint, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";

export const notesTable = pgTable(
  "notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    /** Set by a trigger on every write; see organizationSyncVersionsTable. */
    syncVersion: bigint("sync_version", { mode: "number" }).notNull().default(0)
  },
  (table) => [
    // Every tenant query filters by organization and orders by creation time.
    index("notes_organization_id_created_at_idx").on(table.organizationId, table.createdAt),
    // A sync pull reads an Organization's changes in Sync Version order.
    index("notes_organization_id_sync_version_idx").on(table.organizationId, table.syncVersion)
  ]
);
