import type { AuditEventInput } from "@repo/auth/audit";
import { resolveRolePermissions } from "@repo/auth/permissions";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { resolvePriceCatalog, type CheckoutInput } from "@repo/billing";
import {
  billingCustomersTable,
  billingSubscriptionsTable,
  membersTable,
  organizationsTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestBilling, fakeBillingProvider } from "./billing.test-helpers";
import { createScopedData } from "../../context.data";

let database: TestDatabase;
const organizationIds = { paid: "", unpaid: "", team: "", portal: "" };
let userId: string;

interface Recorded {
  customers: string[];
  checkouts: CheckoutInput[];
  audits: AuditEventInput[];
}

function billingFor(organizationId: string, role = "owner") {
  const recorded: Recorded = { customers: [], checkouts: [], audits: [] };
  const scope: AuthenticatedOrganizationScope = {
    membership: {
      id: `membership-${organizationId}`,
      permissions: resolveRolePermissions(role, []),
      role,
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
  const billing = createTestBilling({
    data: createScopedData({ db: database.db, requireOrganizationScope: () => scope }),
    db: database.db,
    provider: fakeBillingProvider("stripe", {
      createCustomer: ({ organizationId: customerOf }) => {
        recorded.customers.push(customerOf);
        return Promise.resolve(`cus_${customerOf}`);
      },
      createCheckout: (input) => {
        recorded.checkouts.push(input);
        return Promise.resolve({ kind: "redirect", url: "https://checkout.example/session" });
      },
      createPortalSession: ({ customerRef, returnUrl }) =>
        Promise.resolve({ url: `https://portal.example/${customerRef}?return=${returnUrl}` })
    }),
    prices: resolvePriceCatalog({
      BILLING_PRICE_PRO_MONTH: "price_pro_m",
      BILLING_PRICE_BUSINESS_YEAR: "price_biz_y"
    }),
    requireOrganizationScope: () => scope,
    recordAuditEvent: (input) => {
      recorded.audits.push(input);
      return Promise.resolve();
    },
    webAppUrl: "https://app.example",
    usage: { todos: () => Promise.resolve(7) },
    now: () => new Date("2026-10-28T12:00:00Z")
  });
  return { billing, recorded };
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  const [user, colleague, other] = await db
    .insert(usersTable)
    .values([
      { email: "o@example.test", name: "O" },
      { email: "c@example.test", name: "C" },
      { email: "x@example.test", name: "X" }
    ])
    .returning();
  if (!user || !colleague || !other) throw new Error("failed to seed users");
  userId = user.id;
  const [paid, unpaid, team, portal] = await db
    .insert(organizationsTable)
    .values(["paid", "unpaid", "team", "portal"].map((slug) => ({ name: slug, slug, userId })))
    .returning();
  if (!paid || !unpaid || !team || !portal) throw new Error("failed to seed organizations");
  Object.assign(organizationIds, {
    paid: paid.id,
    unpaid: unpaid.id,
    team: team.id,
    portal: portal.id
  });
  await db.insert(membersTable).values(
    [user, colleague, other].map((member) => ({
      organizationId: organizationIds.team,
      role: "member",
      userId: member.id
    }))
  );
  await db.insert(billingSubscriptionsTable).values({
    organizationId: organizationIds.paid,
    provider: "stripe",
    providerSubscriptionId: "sub_paid",
    planKey: "pro",
    interval: "month",
    status: "past_due",
    quantity: 1,
    currentPeriodEnd: new Date("2026-11-28T12:00:00Z"),
    cancelAtPeriodEnd: false
  });
  await db.insert(billingCustomersTable).values({
    organizationId: organizationIds.portal,
    provider: "stripe",
    providerCustomerId: "cus_portal"
  });
}, 30_000);

afterAll(async () => {
  await database.close();
});

describe("plan status and gates", () => {
  it("refuses a feature the free Plan lacks with PLAN_FEATURE_REQUIRED and the Plan that has it", async () => {
    await expect(
      billingFor(organizationIds.unpaid).billing.requireFeature("assistant")
    ).rejects.toMatchObject({
      extensions: { code: "PLAN_FEATURE_REQUIRED", feature: "assistant", requiredPlan: "pro" }
    });
  });

  it("unlocks the assistant only for the Organization whose subscription is paid for", async () => {
    await expect(
      billingFor(organizationIds.paid).billing.requireFeature("assistant")
    ).resolves.toBeUndefined();
    await expect(
      billingFor(organizationIds.unpaid).billing.requireFeature("assistant")
    ).rejects.toMatchObject({
      extensions: { code: "PLAN_FEATURE_REQUIRED" }
    });
  });

  it("reports the Plan, the granting subscription's status, and usage against each limit", async () => {
    expect(await billingFor(organizationIds.paid).billing.status()).toEqual({
      provider: "stripe",
      clientConfig: null,
      plan: "pro",
      subscriptionStatus: "past_due",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-11-28T12:00:00Z"),
      features: ["assistant"],
      limits: [{ key: "todos", max: null, used: 7 }]
    });
  });
});

describe("startCheckout", () => {
  it("creates the provider customer on the first checkout and reuses it on the next", async () => {
    const { billing, recorded } = billingFor(organizationIds.unpaid);

    await expect(billing.startCheckout("pro", "month")).resolves.toEqual({
      kind: "redirect",
      url: "https://checkout.example/session"
    });
    await billing.startCheckout("pro", "month");

    expect(recorded.customers).toEqual([organizationIds.unpaid]);
    expect(recorded.checkouts.map((checkout) => checkout.customerRef)).toEqual([
      `cus_${organizationIds.unpaid}`,
      `cus_${organizationIds.unpaid}`
    ]);
    expect(recorded.audits[0]).toMatchObject({
      action: "billing_checkout_started",
      metadata: { plan: "pro", interval: "month" },
      organizationId: organizationIds.unpaid
    });
  });

  it("charges a per-seat Plan for every member and returns to the billing page", async () => {
    const { billing, recorded } = billingFor(organizationIds.team);

    await billing.startCheckout("business", "year");

    expect(recorded.checkouts).toEqual([
      {
        customerRef: `cus_${organizationIds.team}`,
        organizationId: organizationIds.team,
        priceId: "price_biz_y",
        quantity: 3,
        successUrl: "https://app.example/organization/billing?checkout=success",
        cancelUrl: "https://app.example/organization/billing?checkout=canceled"
      }
    ]);
  });

  it.each([
    ["an admin", "admin", "pro", "month", "permission required: billing:manage"],
    ["a Plan without a price", "owner", "pro", "year", "not for sale"],
    ["a Plan that is never sold", "owner", "unlimited", "month", "not for sale"]
  ] as const)(
    "refuses %s without calling the provider",
    async (_case, role, plan, interval, message) => {
      const { billing, recorded } = billingFor(organizationIds.unpaid, role);

      await expect(billing.startCheckout(plan, interval)).rejects.toThrow(message);
      expect(recorded.customers).toEqual([]);
      expect(recorded.checkouts).toEqual([]);
    }
  );

  it("sends an Organization that already pays to the portal instead", async () => {
    const { billing, recorded } = billingFor(organizationIds.paid);

    await expect(billing.startCheckout("business", "year")).rejects.toMatchObject({
      extensions: { code: "BAD_USER_INPUT" }
    });
    expect(recorded.checkouts).toEqual([]);
  });
});

describe("openPortal", () => {
  it("opens the portal of the Organization's provider customer", async () => {
    const { billing, recorded } = billingFor(organizationIds.portal);

    await expect(billing.openPortal()).resolves.toBe(
      "https://portal.example/cus_portal?return=https://app.example/organization/billing"
    );
    expect(recorded.audits.map((audit) => audit.action)).toEqual(["billing_portal_opened"]);
  });

  it("refuses an Organization that has no billing account yet", async () => {
    await expect(billingFor(organizationIds.paid).billing.openPortal()).rejects.toThrow(
      "no billing account yet"
    );
  });
});
