import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  // Nullable: better-auth stores credentials in accounts.password; this legacy
  // column only carries pre-migration hashes and is absent for new signups.
  passwordHash: text("password_hash"),
  name: varchar("name", { length: 255 }).notNull(),
  image: text("image"),
  role: varchar("role", { length: 32 }).notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
