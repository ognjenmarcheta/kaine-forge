import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  image: text("image"),
  role: varchar("role", { length: 32 }).notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(false),
  // Set by the better-auth twoFactor plugin once 2FA enrollment is verified.
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  // Language of the user's emails, written by the web language switch. Null
  // or an unsupported value means DEFAULT_LANGUAGE (@repo/translation).
  locale: varchar("locale", { length: 16 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
