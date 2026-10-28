import {
  billingSubscriptionsTable,
  membersTable,
  organizationsTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { createLogger } from "@repo/logger";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cancelOrganizationSubscriptions } from "./billing.cancel";
import { createSeatSync } from "./billing.seats";
import { fakeBillingProvider } from "./billing.test-helpers";

let database: TestDatabase;
let userIds: string[];
let calls: string[];
let refuse: Set<string>;

const logger = createLogger({ level: "silent", name: "billing-seats-test" });
const provider = fakeBillingProvider("stripe", {
  updateQuantity: (subscriptionRef, quantity) => {
    if (refuse.has(subscriptionRef)) return Promise.reject(new Error("provider unavailable"));
    calls.push(`${subscriptionRef}=${quantity}`);
    return Promise.resolve();
  },
  cancelNow: (subscriptionRef) => {
    if (refuse.has(subscriptionRef)) return Promise.reject(new Error("provider unavailable"));
    calls.push(`cancel ${subscriptionRef}`);
    return Promise.resolve();
  }
});

/** A new Organization with `members` members and one subscription per row. */
async function organizationWith(
  members: number,
  subscriptions: { ref: string; planKey: string; status: string; quantity: number }[]
): Promise<string> {
  const [organization] = await database.db
    .insert(organizationsTable)
    .values({ name: "Org", slug: `org-${crypto.randomUUID()}`, userId: userIds[0] })
    .returning();
  if (!organization) throw new Error("failed to seed organization");
  if (members > 0) {
    await database.db.insert(membersTable).values(
      userIds.slice(0, members).map((userId) => ({
        organizationId: organization.id,
        role: "member",
        userId
      }))
    );
  }
  for (const subscription of subscriptions) {
    await database.db.insert(billingSubscriptionsTable).values({
      organizationId: organization.id,
      provider: "stripe",
      providerSubscriptionId: subscription.ref,
      planKey: subscription.planKey,
      interval: "month",
      status: subscription.status,
      quantity: subscription.quantity,
      cancelAtPeriodEnd: false
    });
  }
  return organization.id;
}

async function quantities() {
  return database.db
    .select({
      ref: billingSubscriptionsTable.providerSubscriptionId,
      quantity: billingSubscriptionsTable.quantity
    })
    .from(billingSubscriptionsTable)
    .orderBy(asc(billingSubscriptionsTable.providerSubscriptionId));
}

beforeAll(async () => {
  database = await createTestDatabase();
  const users = await database.db
    .insert(usersTable)
    .values(["a", "b", "c"].map((name) => ({ email: `${name}@example.test`, name })))
    .returning();
  userIds = users.map((user) => user.id);
}, 30_000);

beforeEach(async () => {
  await database.db.delete(billingSubscriptionsTable);
  calls = [];
  refuse = new Set();
});

afterAll(async () => {
  await database.close();
});

describe("seat sync", () => {
  it("sets a live per-seat subscription's quantity to the member count", async () => {
    const organizationId = await organizationWith(3, [
      { ref: "sub_biz", planKey: "business", status: "past_due", quantity: 1 }
    ]);

    await createSeatSync({ db: database.db, provider, logger }).syncOrganization(organizationId);

    expect(calls).toEqual(["sub_biz=3"]);
    expect(await quantities()).toEqual([{ ref: "sub_biz", quantity: 3 }]);
  });

  it("leaves flat Plans, ended subscriptions, and quantities that already match alone", async () => {
    const organizationId = await organizationWith(2, [
      { ref: "sub_flat", planKey: "pro", status: "active", quantity: 1 },
      { ref: "sub_ended", planKey: "business", status: "canceled", quantity: 1 },
      { ref: "sub_match", planKey: "business", status: "active", quantity: 2 }
    ]);

    await createSeatSync({ db: database.db, provider, logger }).syncOrganization(organizationId);

    expect(calls).toEqual([]);
  });

  it("rejects when the provider refuses, so the job retries, and keeps the stored quantity", async () => {
    const organizationId = await organizationWith(2, [
      { ref: "sub_biz", planKey: "business", status: "active", quantity: 1 }
    ]);
    refuse.add("sub_biz");

    await expect(
      createSeatSync({ db: database.db, provider, logger }).syncOrganization(organizationId)
    ).rejects.toThrow("provider unavailable");
    expect(await quantities()).toEqual([{ ref: "sub_biz", quantity: 1 }]);
  });

  it("reconciles every drifted Organization and keeps going after one fails", async () => {
    await organizationWith(2, [
      { ref: "sub_a", planKey: "business", status: "active", quantity: 1 }
    ]);
    await organizationWith(3, [
      { ref: "sub_b", planKey: "business", status: "active", quantity: 1 }
    ]);
    refuse.add("sub_a");

    await expect(
      createSeatSync({ db: database.db, provider, logger }).reconcile()
    ).resolves.toEqual({
      synced: 1,
      failed: 1
    });
    expect(await quantities()).toEqual([
      { ref: "sub_a", quantity: 1 },
      { ref: "sub_b", quantity: 3 }
    ]);
  });
});

describe("cancelOrganizationSubscriptions", () => {
  it("cancels every subscription the provider may still bill, only of the given Organizations", async () => {
    const deleted = await organizationWith(1, [
      { ref: "sub_active", planKey: "pro", status: "active", quantity: 1 },
      { ref: "sub_paused", planKey: "pro", status: "paused", quantity: 1 },
      { ref: "sub_done", planKey: "pro", status: "canceled", quantity: 1 }
    ]);
    await organizationWith(1, [
      { ref: "sub_other", planKey: "pro", status: "active", quantity: 1 }
    ]);

    await cancelOrganizationSubscriptions({ db: database.db, provider, logger }, [deleted]);

    expect(calls.sort()).toEqual(["cancel sub_active", "cancel sub_paused"]);
  });

  it("throws when the provider refuses, so the delete fails", async () => {
    const deleted = await organizationWith(1, [
      { ref: "sub_active", planKey: "pro", status: "active", quantity: 1 }
    ]);
    refuse.add("sub_active");

    await expect(
      cancelOrganizationSubscriptions({ db: database.db, provider, logger }, [deleted])
    ).rejects.toThrow("provider unavailable");
  });
});
