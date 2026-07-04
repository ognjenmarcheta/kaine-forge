import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const verificationsTable = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  // better-auth stores the verification payload in `value` (renamed from the
  // previous `token` column; some flows store JSON strings, hence text and
  // no unique constraint, matching better-auth's canonical model).
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
