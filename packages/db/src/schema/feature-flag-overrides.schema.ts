import { boolean, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";

/**
 * One Organization's override of one feature flag. The flag registry in
 * `@repo/feature-flags` decides which keys an override may change; a row for
 * any other key has no effect.
 */
export const featureFlagOverridesTable = pgTable(
  "feature_flag_overrides",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    flagKey: varchar("flag_key", { length: 64 }).notNull(),
    enabled: boolean("enabled").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.flagKey] })]
);
