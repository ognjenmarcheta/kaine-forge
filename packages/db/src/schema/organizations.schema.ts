import { boolean, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { usersTable } from "./users.schema";

export const organizationsTable = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  logo: text("logo"),
  // A user's Personal Organization: it cannot be deleted, left, or handed over.
  personal: boolean("personal").notNull().default(false),
  // The better-auth organization plugin JSON.stringifys metadata before
  // writing, so jsonb values it stores arrive double-encoded (a JSON string).
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// One row per deleted Organization, written by the organizations_storage_purge
// trigger (also on a cascade from a deleted user). The API storage sweep
// deletes the Organization's objects and logo, then this row. No foreign key:
// the Organization is already gone.
export const organizationStoragePurgesTable = pgTable("organization_storage_purges", {
  organizationId: uuid("organization_id").primaryKey(),
  logo: text("logo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
