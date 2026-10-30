import type { AuditEventInput } from "@repo/auth/audit";
import { UnknownPriceError, type NormalizedSubscription } from "@repo/billing";
import {
  billingCustomersTable,
  billingEventsTable,
  billingSubscriptionsTable,
  organizationsTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { createLogger } from "@repo/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { fakeBillingProvider } from "./billing.test-helpers";
import { createBillingWebhookHandler } from "./billing.webhook";

let database: TestDatabase;
let organizationId: string;
let audits: AuditEventInput[];
// What the provider answers when the handler refetches the subscription.
let current: () => NormalizedSubscription;

function subscriptionAt(status: NormalizedSubscription["status"]): NormalizedSubscription {
  return {
    providerSubscriptionId: "sub_1",
    providerCustomerId: "cus_1",
    organizationId,
    planKey: "pro",
    interval: "month",
    status,
    quantity: 1,
    currentPeriodEnd: new Date("2026-11-28T12:00:00Z"),
    cancelAtPeriodEnd: false,
    trialEndsAt: null
  };
}

// A delivery is `<event id>` signed by the header `x-signature: valid`.
const handle = (providerName: string, eventId: string, signature = "valid") =>
  createBillingWebhookHandler({
    db: database.db,
    provider: fakeBillingProvider("stripe", {
      verifyWebhook: (rawBody, headers) =>
        headers["x-signature"] === "valid"
          ? Promise.resolve({ eventId: rawBody, subscriptionRef: "sub_1" })
          : Promise.reject(new Error("bad signature")),
      fetchSubscription: () => Promise.resolve().then(() => current())
    }),
    recordAuditEvent: (input) => {
      audits.push(input);
      return Promise.resolve();
    },
    logger: createLogger({ level: "silent", name: "billing-webhook-test" })
  })(providerName, eventId, { "x-signature": signature });

async function stored() {
  const subscriptions = await database.db
    .select({
      status: billingSubscriptionsTable.status,
      planKey: billingSubscriptionsTable.planKey
    })
    .from(billingSubscriptionsTable);
  const events = await database.db
    .select({ eventId: billingEventsTable.eventId })
    .from(billingEventsTable);
  return { subscriptions, events: events.map((event) => event.eventId) };
}

beforeAll(async () => {
  database = await createTestDatabase();
  const [user] = await database.db
    .insert(usersTable)
    .values({ email: "o@example.test", name: "O" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [organization] = await database.db
    .insert(organizationsTable)
    .values({ name: "Org", slug: "org", userId: user.id })
    .returning();
  if (!organization) throw new Error("failed to seed organization");
  organizationId = organization.id;
}, 30_000);

beforeEach(async () => {
  await database.db.delete(billingSubscriptionsTable);
  await database.db.delete(billingCustomersTable);
  await database.db.delete(billingEventsTable);
  audits = [];
  current = () => subscriptionAt("active");
});

afterAll(async () => {
  await database.close();
});

describe("billing webhook handler", () => {
  it("stores the provider's current subscription for a signed event and records the event", async () => {
    await expect(handle("stripe", "evt_1")).resolves.toBe(200);

    expect(await stored()).toEqual({
      subscriptions: [{ status: "active", planKey: "pro" }],
      events: ["evt_1"]
    });
    expect(audits).toMatchObject([
      {
        action: "billing_subscription_changed",
        actorUserId: null,
        metadata: { plan: "pro", status: "active" },
        organizationId
      }
    ]);
  });

  it("ignores a repeated event, and stores the provider's state for a new one whatever it said", async () => {
    await handle("stripe", "evt_1");
    current = () => subscriptionAt("canceled");

    await expect(handle("stripe", "evt_1")).resolves.toBe(200);
    expect((await stored()).subscriptions).toEqual([{ status: "active", planKey: "pro" }]);

    await expect(handle("stripe", "evt_0_older")).resolves.toBe(200);
    expect((await stored()).subscriptions).toEqual([{ status: "canceled", planKey: "pro" }]);
  });

  it("refuses a bad signature with 400 and an inactive provider with 404, and writes nothing", async () => {
    await expect(handle("stripe", "evt_1", "forged")).resolves.toBe(400);
    await expect(handle("paddle", "evt_1")).resolves.toBe(404);

    expect(await stored()).toEqual({ subscriptions: [], events: [] });
  });

  it("fails on an unknown price without recording the event, so the provider's retry processes it", async () => {
    current = () => {
      throw new UnknownPriceError("price_other");
    };

    await expect(handle("stripe", "evt_1")).rejects.toThrow(UnknownPriceError);
    expect(await stored()).toEqual({ subscriptions: [], events: [] });

    current = () => subscriptionAt("active");
    await expect(handle("stripe", "evt_1")).resolves.toBe(200);
    expect((await stored()).events).toEqual(["evt_1"]);
  });
});
