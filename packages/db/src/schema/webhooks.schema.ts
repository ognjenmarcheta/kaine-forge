import { index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";

/**
 * Webhook Endpoints: HTTPS URLs that receive signed deliveries of an
 * Organization's events. `secret` signs every delivery, so it is stored; the
 * API returns it once, at creation.
 */
export const webhookEndpointsTable = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    eventTypes: text("event_types").array().notNull(),
    createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("webhook_endpoints_organization_id_created_at_id_idx").on(
      table.organizationId,
      table.createdAt,
      table.id
    )
  ]
);

/** One delivery attempt to a Webhook Endpoint, written once per attempt. */
export const webhookDeliveriesTable = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpointsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    attempt: integer("attempt").notNull(),
    /** Null when no response arrived: blocked address, timeout, or network error. */
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms").notNull(),
    /** Why no 2xx arrived, as a short code; never the response body. */
    error: varchar("error", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("webhook_deliveries_endpoint_id_created_at_id_idx").on(
      table.endpointId,
      table.createdAt,
      table.id
    ),
    index("webhook_deliveries_event_id_idx").on(table.eventId, table.endpointId)
  ]
);
