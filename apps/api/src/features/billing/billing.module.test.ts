import { resolveRolePermissions } from "@repo/auth/permissions";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { billingSubscriptionsTable, organizationsTable, usersTable } from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBilling, type Billing } from "./billing.module";
import { createScopedData } from "../../context.data";

let database: TestDatabase;
const organizationIds: Record<"paid" | "unpaid", string> = { paid: "", unpaid: "" };
let userId: string;

function billingFor(organizationId: string): Billing {
  const scope: AuthenticatedOrganizationScope = {
    membership: {
      id: `membership-${organizationId}`,
      permissions: resolveRolePermissions("owner", []),
      role: "owner",
      userId
    },
    organizationId,
    user: {
      email: "o@example.test",
      emailVerified: true,
      id: userId,
      name: "O",
      twoFactorEnabled: false
    },
    userId
  };
  return createBilling({
    data: createScopedData({ db: database.db, requireOrganizationScope: () => scope }),
    provider: "stripe",
    usage: { todos: () => Promise.resolve(7) },
    now: () => new Date("2026-10-28T12:00:00Z")
  });
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  const [user] = await db
    .insert(usersTable)
    .values({ email: "o@example.test", name: "O" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  userId = user.id;
  const [paid, unpaid] = await db
    .insert(organizationsTable)
    .values([
      { name: "Paid", slug: "paid", userId },
      { name: "Unpaid", slug: "unpaid", userId }
    ])
    .returning();
  if (!paid || !unpaid) throw new Error("failed to seed organizations");
  organizationIds.paid = paid.id;
  organizationIds.unpaid = unpaid.id;
  await db.insert(billingSubscriptionsTable).values({
    organizationId: paid.id,
    provider: "stripe",
    providerSubscriptionId: "sub_paid",
    planKey: "pro",
    interval: "month",
    status: "past_due",
    quantity: 1,
    currentPeriodEnd: new Date("2026-11-28T12:00:00Z"),
    cancelAtPeriodEnd: false
  });
}, 30_000);

afterAll(async () => {
  await database.close();
});

describe("createBilling", () => {
  it("refuses a feature the free Plan lacks with PLAN_FEATURE_REQUIRED and the Plan that has it", async () => {
    await expect(
      billingFor(organizationIds.unpaid).requireFeature("assistant")
    ).rejects.toMatchObject({
      extensions: { code: "PLAN_FEATURE_REQUIRED", feature: "assistant", requiredPlan: "pro" }
    });
  });

  it("unlocks the assistant only for the Organization whose subscription is paid for", async () => {
    await expect(
      billingFor(organizationIds.paid).requireFeature("assistant")
    ).resolves.toBeUndefined();
    await expect(
      billingFor(organizationIds.unpaid).requireFeature("assistant")
    ).rejects.toMatchObject({
      extensions: { code: "PLAN_FEATURE_REQUIRED" }
    });
  });

  it("reports the Plan, the granting subscription's status, and usage against each limit", async () => {
    expect(await billingFor(organizationIds.paid).status()).toEqual({
      provider: "stripe",
      plan: "pro",
      subscriptionStatus: "past_due",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-11-28T12:00:00Z"),
      features: ["assistant"],
      limits: [{ key: "todos", max: null, used: 7 }]
    });
  });
});
