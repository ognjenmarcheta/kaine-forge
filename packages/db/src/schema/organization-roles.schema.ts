import { pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";

// Custom Roles of an Organization, written by the better-auth organization
// plugin's dynamic access control. `permission` is its resource → actions map
// as JSON text.
export const organizationRolesTable = pgTable(
  "organization_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull(),
    permission: text("permission").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("organization_roles_organization_role_unique").on(table.organizationId, table.role)
  ]
);
