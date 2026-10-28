import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";

/** An Organization's customer at the active payment provider; recorded at first checkout. */
export const billingCustomersTable = pgTable(
  "billing_customers",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 16 }).notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  // Not unique: Paddle keeps one customer per email address, so an owner's
  // Organizations can share one provider customer.
  (table) => [
    index("billing_customers_provider_customer_id_idx").on(table.provider, table.providerCustomerId)
  ]
);

/**
 * A provider subscription as last fetched from the provider. Webhooks
 * refetch and upsert it, so a row mirrors the provider's current state.
 */
export const billingSubscriptionsTable = pgTable(
  "billing_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 16 }).notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    planKey: varchar("plan_key", { length: 32 }).notNull(),
    interval: varchar("interval", { length: 8 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    quantity: integer("quantity").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("billing_subscriptions_provider_subscription_id_idx").on(
      table.provider,
      table.providerSubscriptionId
    ),
    index("billing_subscriptions_organization_id_idx").on(table.organizationId)
  ]
);

/** Provider webhook event ids already processed, so a redelivery does nothing. System-level. */
export const billingEventsTable = pgTable(
  "billing_events",
  {
    provider: varchar("provider", { length: 16 }).notNull(),
    eventId: text("event_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.provider, table.eventId] })]
);
