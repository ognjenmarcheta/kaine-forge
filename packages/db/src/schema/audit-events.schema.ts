import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/** One value of an Audit Event's metadata; the action names its shape. */
export type AuditEventMetadataValue = string | number | boolean | null;

/**
 * Audit Events: what the system recorded about a security-relevant or
 * membership action. Rows are written once and never edited. Neither id has a
 * foreign key, so an event outlives its actor and its Organization until
 * retention removes it.
 */
export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Null for a user-level event such as a password change. */
    organizationId: uuid("organization_id"),
    /** Null for a system action. */
    actorUserId: uuid("actor_user_id"),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }).notNull(),
    targetId: uuid("target_id").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, AuditEventMetadataValue>>()
      .notNull()
      .default({}),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    // Millisecond precision, so a JavaScript Date round-trips exactly and a
    // (created_at, id) page cursor never skips a row.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull()
  },
  (table) => [
    // The viewer reads one Organization's events newest first, by (created_at, id) cursor.
    index("audit_events_organization_id_created_at_id_idx").on(
      table.organizationId,
      table.createdAt,
      table.id
    )
  ]
);
