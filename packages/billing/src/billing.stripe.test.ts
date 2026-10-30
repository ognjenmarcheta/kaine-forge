import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { resolvePriceCatalog, UnknownPriceError } from "./billing.prices";
import {
  createStripeBillingProvider,
  normalizeStripeSubscription,
  type StripeSubscriptionFields
} from "./billing.stripe";

const prices = resolvePriceCatalog({ BILLING_PRICE_BUSINESS_YEAR: "price_biz_y" });
const WEBHOOK_SECRET = "whsec_test_secret";
const provider = createStripeBillingProvider({
  secretKey: "sk_test_unused",
  webhookSecret: WEBHOOK_SECRET,
  prices
});
// Signs payloads the way Stripe does; no request leaves the process.
const signer = new Stripe("sk_test_unused").webhooks;

function subscription(overrides: Partial<StripeSubscriptionFields> = {}): StripeSubscriptionFields {
  return {
    id: "sub_1",
    customer: "cus_1",
    metadata: { organization_id: "org-1" },
    status: "past_due",
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: null,
    items: {
      data: [
        { id: "si_1", price: { id: "price_biz_y" }, quantity: 4, current_period_end: 1793188800 }
      ]
    },
    ...overrides
  };
}

interface StripeEventPayload {
  id: string;
  object: "event";
  type: string;
  data: { object: Record<string, string> };
}

function signed(payload: StripeEventPayload): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(payload);
  return {
    body,
    headers: {
      "stripe-signature": signer.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET })
    }
  };
}

describe("normalizeStripeSubscription", () => {
  it("reads the Plan from the item's price and the period from the item", () => {
    expect(normalizeStripeSubscription(subscription(), prices)).toEqual({
      providerSubscriptionId: "sub_1",
      providerCustomerId: "cus_1",
      organizationId: "org-1",
      planKey: "business",
      interval: "year",
      status: "past_due",
      quantity: 4,
      currentPeriodEnd: new Date("2026-10-28T12:00:00Z"),
      cancelAtPeriodEnd: false,
      trialEndsAt: null
    });
  });

  it("treats a scheduled cancel_at as a cancellation at period end, and incomplete_expired as expired", () => {
    expect(
      normalizeStripeSubscription(
        subscription({ cancel_at: 1793188800, status: "incomplete_expired" }),
        prices
      )
    ).toMatchObject({ cancelAtPeriodEnd: true, status: "expired" });
  });

  it("refuses a price outside the catalog", () => {
    expect(() =>
      normalizeStripeSubscription(
        subscription({
          items: {
            data: [{ id: "si_1", price: { id: "price_x" }, quantity: 1, current_period_end: 1 }]
          }
        }),
        prices
      )
    ).toThrow(UnknownPriceError);
  });
});

describe("Stripe verifyWebhook", () => {
  it.each([
    ["customer.subscription.updated", { id: "sub_9", object: "subscription" }, "sub_9"],
    [
      "checkout.session.completed",
      { id: "cs_1", object: "checkout.session", subscription: "sub_8" },
      "sub_8"
    ],
    ["invoice.paid", { id: "in_1", object: "invoice" }, null]
  ])("names the subscription a signed %s event concerns", async (type, object, subscriptionRef) => {
    const { body, headers } = signed({ id: "evt_1", object: "event", type, data: { object } });

    await expect(provider.verifyWebhook(body, headers)).resolves.toEqual({
      eventId: "evt_1",
      subscriptionRef
    });
  });

  it("refuses a body that does not match its signature", async () => {
    const { headers } = signed({
      id: "evt_1",
      object: "event",
      type: "invoice.paid",
      data: { object: {} }
    });
    const tampered = JSON.stringify({
      id: "evt_2",
      object: "event",
      type: "invoice.paid",
      data: { object: {} }
    });

    await expect(provider.verifyWebhook(tampered, headers)).rejects.toThrow();
  });
});
