import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";

export const fileStatusEnum = pgEnum("file_status", ["pending", "uploaded", "deleted"]);

/** What an Attachment is attached to. Mirrors the GraphQL `AttachmentEntityType` enum. */
export const attachmentEntityTypeEnum = pgEnum("attachment_entity_type", ["general", "todo"]);

export const filesTable = pgTable(
  "files",
  {
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
    entityType: attachmentEntityTypeEnum("entity_type"),
    entityId: uuid("entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    /** When the storage sweep deleted this row's object; null while it may still exist. */
    purgedAt: timestamp("purged_at", { withTimezone: true })
  },
  (table) => [
    // Attachment lookups filter by organization plus (entity_type, entity_id).
    index("files_organization_id_entity_type_entity_id_idx").on(
      table.organizationId,
      table.entityType,
      table.entityId
    ),
    // The storage sweep walks rows whose object may still exist, least recently touched first.
    index("files_unpurged_updated_at_idx")
      .on(table.updatedAt)
      .where(sql`${table.purgedAt} is null`)
  ]
);
