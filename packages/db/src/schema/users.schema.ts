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
  // Set once the user finishes or skips the web first-run onboarding. Null
  // means the web app still shows it.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// The avatar URL of each deleted user, written by the users_public_asset_purge
// trigger. The API storage sweep deletes the object from the public bucket
// when its key belongs to that user, then this row. Any other URL, such as a
// social provider's avatar, is only dropped. No foreign key: the user is gone.
export const publicAssetPurgesTable = pgTable("public_asset_purges", {
  userId: uuid("user_id").primaryKey(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Set when a sweep run fails on this row; failed rows go to the back of the queue.
  attemptedAt: timestamp("attempted_at", { withTimezone: true })
});
