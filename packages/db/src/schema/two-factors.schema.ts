import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { usersTable } from "./users.schema";

// better-auth twoFactor plugin storage (model "twoFactor", pluralized by the
// adapter). secret and backup_codes hold plugin-encrypted values.
export const twoFactorsTable = pgTable(
  "two_factors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true })
  },
  (table) => [
    // The plugin looks rows up by user on every 2FA step and by secret on
    // verification (better-auth performance guide).
    index("two_factors_user_id_idx").on(table.userId),
    index("two_factors_secret_idx").on(table.secret)
  ]
);
