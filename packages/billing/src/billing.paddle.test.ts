import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createPaddleBillingProvider,
  normalizePaddleSubscription,
  type PaddleSubscriptionFields
} from "./billing.paddle";
import { resolvePriceCatalog, UnknownPriceError } from "./billing.prices";

const prices = resolvePriceCatalog({ BILLING_PRICE_PRO_MONTH: "pri_pro_m" });
const WEBHOOK_SECRET = "pdl_ntfset_test_secret";
const provider = createPaddleBillingProvider({
  apiKey: "pdl_sdbx_apikey_unused",
  webhookSecret: WEBHOOK_SECRET,
  clientToken: "test_client_token",
  environment: "sandbox",
  prices
});

function subscription(overrides: Partial<PaddleSubscriptionFields> = {}): PaddleSubscriptionFields {
  return {
    id: "sub_01",
    status: "trialing",
    customerId: "ctm_01",
    customData: { organization_id: "org-1" },
    currentBillingPeriod: { startsAt: "2026-10-28T12:00:00Z", endsAt: "2026-11-28T12:00:00Z" },
    scheduledChange: null,
    items: [
      { price: { id: "pri_pro_m" }, quantity: 1, trialDates: { endsAt: "2026-11-11T12:00:00Z" } }
    ],
    ...overrides
  };
}

// Paddle signs `<ts>:<body>` with HMAC-SHA256 and sends `ts=<ts>;h1=<hex>`.
function signed(eventType: string, data: Record<string, unknown>) {
  const body = JSON.stringify({
    event_id: "evt_01",
    notification_id: "ntf_01",
    event_type: eventType,
    occurred_at: "2026-10-28T12:00:00Z",
    data
  });
  const ts = Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}:${body}`).digest("hex");
  return { body, headers: { "paddle-signature": `ts=${ts};h1=${h1}` } };
}

describe("normalizePaddleSubscription", () => {
  it("reads the Plan from the item's price, the period, the trial, and the Organization", () => {
    expect(normalizePaddleSubscription(subscription(), prices)).toEqual({
      providerSubscriptionId: "sub_01",
      providerCustomerId: "ctm_01",
      organizationId: "org-1",
      planKey: "pro",
      interval: "month",
      status: "trialing",
      quantity: 1,
      currentPeriodEnd: new Date("2026-11-28T12:00:00Z"),
      cancelAtPeriodEnd: false,
      trialEndsAt: new Date("2026-11-11T12:00:00Z")
    });
  });

  it("treats a scheduled cancel as a cancellation at period end, and no custom data as no Organization", () => {
    expect(
      normalizePaddleSubscription(
        subscription({
          customData: null,
          scheduledChange: {
            action: "cancel",
            effectiveAt: "2026-11-28T12:00:00Z",
            resumeAt: null
          }
        }),
        prices
      )
    ).toMatchObject({ cancelAtPeriodEnd: true, organizationId: null });
  });

  it("refuses a price outside the catalog", () => {
    expect(() =>
      normalizePaddleSubscription(
        subscription({ items: [{ price: { id: "pri_other" }, quantity: 1, trialDates: null }] }),
        prices
      )
    ).toThrow(UnknownPriceError);
  });
});

describe("Paddle verifyWebhook", () => {
  it.each([
    [
      "subscription.canceled",
      { id: "sub_09", items: [], billing_cycle: { interval: "month", frequency: 1 } },
      "sub_09"
    ],
    [
      "transaction.completed",
      { id: "txn_01", subscription_id: "sub_08", items: [], payments: [] },
      "sub_08"
    ],
    ["customer.updated", { id: "ctm_01" }, null]
  ])("names the subscription a signed %s event concerns", async (type, data, subscriptionRef) => {
    const { body, headers } = signed(type, data);

    await expect(provider.verifyWebhook(body, headers)).resolves.toEqual({
      eventId: "evt_01",
      subscriptionRef
    });
  });
});
