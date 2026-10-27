import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";

/**
 * API Keys, written by the better-auth api-key plugin (model `apikey`). Each
 * key belongs to one Organization; the plugin's `referenceId` field maps to
 * `organization_id`. `key` holds the SHA-256 hash only: the plain key is
 * returned once at creation and stored nowhere. `metadata` is JSON text that
 * names the creating user; `permissions` is the granted resource → actions map
 * as JSON text.
 */
export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    configId: text("config_id").notNull().default("default"),
    name: text("name"),
    start: text("start"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").notNull().default(false),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").notNull().default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    permissions: text("permissions"),
    metadata: text("metadata")
  },
  (table) => [
    index("api_keys_key_idx").on(table.key),
    index("api_keys_organization_id_created_at_id_idx").on(
      table.organizationId,
      table.createdAt,
      table.id
    )
  ]
);
