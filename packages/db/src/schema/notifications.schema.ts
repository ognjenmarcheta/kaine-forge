import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";

/** One value of a Notification's payload; the notification type names its shape. */
export type NotificationPayloadValue = string | number | boolean | null;

/**
 * Notifications: what the system told one user. Only the recipient reads or
 * marks a row, whatever their Active Organization. A row about an
 * Organization names it and goes with it when the Organization is deleted.
 */
export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** Null for a Notification about no Organization. */
    organizationId: uuid("organization_id").references(() => organizationsTable.id, {
      onDelete: "cascade"
    }),
    type: varchar("type", { length: 64 }).notNull(),
    payload: jsonb("payload")
      .$type<Record<string, NotificationPayloadValue>>()
      .notNull()
      .default({}),
    readAt: timestamp("read_at", { withTimezone: true, precision: 3 }),
    // Millisecond precision, so a JavaScript Date round-trips exactly and a
    // (created_at, id) page cursor never skips a row.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull()
  },
  (table) => [
    // The inbox reads one user's Notifications newest first, by (created_at, id) cursor.
    index("notifications_user_id_created_at_id_idx").on(table.userId, table.createdAt, table.id)
  ]
);

/**
 * A user's channel choice for one notification type. A type without a row
 * uses the defaults its definition declares.
 */
export const notificationPreferencesTable = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    inApp: boolean("in_app").notNull(),
    email: boolean("email").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.type] })]
);
