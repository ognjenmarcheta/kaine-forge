import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { createPaddleBillingProvider } from "./billing.paddle";
import { resolvePriceCatalog } from "./billing.prices";
import { createStripeBillingProvider } from "./billing.stripe";
import type { BillingProvider } from "./billing.type";

// The signature contract every adapter keeps: an unsigned or altered delivery
// never reaches the subscription refetch.
const SECRET = "whsec_contract_secret";
const prices = resolvePriceCatalog({});
const body = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: {} });

const adapters: [string, BillingProvider, string, (payload: string) => string][] = [
  [
    "stripe",
    createStripeBillingProvider({ secretKey: "sk_test_unused", webhookSecret: SECRET, prices }),
    "stripe-signature",
    (payload) =>
      new Stripe("sk_test_unused").webhooks.generateTestHeaderString({ payload, secret: SECRET })
  ],
  [
    "paddle",
    createPaddleBillingProvider({
      apiKey: "pdl_sdbx_apikey_unused",
      webhookSecret: SECRET,
      clientToken: "test_client_token",
      environment: "sandbox",
      prices
    }),
    "paddle-signature",
    (payload) => {
      const ts = Math.floor(Date.now() / 1000);
      return `ts=${ts};h1=${createHmac("sha256", SECRET).update(`${ts}:${payload}`).digest("hex")}`;
    }
  ]
];

describe.each(adapters)("%s webhook signatures", (_name, provider, header, sign) => {
  it("refuses a delivery without the signature header", async () => {
    await expect(provider.verifyWebhook(body, {})).rejects.toThrow(`missing ${header} header`);
  });

  it("refuses a body that does not match its signature", async () => {
    await expect(
      provider.verifyWebhook(body.replace("evt_1", "evt_2"), { [header]: sign(body) })
    ).rejects.toThrow();
  });

  it("refuses a signature made with another secret", async () => {
    const forged = sign(body).replace(/[0-9a-f]{64}/, "0".repeat(64));

    await expect(provider.verifyWebhook(body, { [header]: forged })).rejects.toThrow();
  });
});
