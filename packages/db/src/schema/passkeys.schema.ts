import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { usersTable } from "./users.schema";

// @better-auth/passkey storage (model "passkey", pluralized by the adapter).
// Property names match the plugin's field names, credentialID included. A row
// holds a WebAuthn public key, never a secret.
export const passkeysTable = pgTable(
  "passkeys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    aaguid: text("aaguid")
  },
  (table) => [
    // The plugin lists by user and finds the credential on every passkey sign-in.
    index("passkeys_user_id_idx").on(table.userId),
    uniqueIndex("passkeys_credential_id_idx").on(table.credentialID)
  ]
);
