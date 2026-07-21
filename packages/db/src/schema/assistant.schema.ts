import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";

export const assistantConversationsTable = pgTable(
  "assistant_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    // Conversation lists filter by organization and owner, newest activity first.
    index("assistant_conversations_organization_id_user_id_updated_at_idx").on(
      table.organizationId,
      table.userId,
      table.updatedAt
    )
  ]
);

export const assistantMessagesTable = pgTable(
  "assistant_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => assistantConversationsTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull(),
    content: text("content").notNull(),
    toolActions: jsonb("tool_actions"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    // Message history is always fetched per conversation in creation order.
    index("assistant_messages_conversation_id_created_at_idx").on(
      table.conversationId,
      table.createdAt
    )
  ]
);
