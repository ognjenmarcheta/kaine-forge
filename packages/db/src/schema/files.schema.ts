import { integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";

export const fileStatusEnum = pgEnum("file_status", ["pending", "uploaded", "deleted"]);

export const filesTable = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull(),
  bucket: varchar("bucket", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 127 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: fileStatusEnum("status").notNull().default("pending"),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 127 }),
  entityId: uuid("entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
