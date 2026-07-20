import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { notesTable } from "./notes.schema";
import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";

export const todosTable = pgTable(
  "todos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    completed: boolean("completed").notNull().default(false),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notesTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    // Every tenant query filters by organization and orders by creation time.
    index("todos_organization_id_created_at_idx").on(table.organizationId, table.createdAt)
  ]
);
