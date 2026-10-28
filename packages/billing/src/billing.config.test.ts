import { describe, expect, it } from "vitest";

import { createBillingProvider } from "./billing.config";

const paddle = {
  BILLING_PROVIDER: "paddle",
  PADDLE_API_KEY: "pdl_sdbx_apikey_unused",
  PADDLE_WEBHOOK_SECRET: "pdl_ntfset_unused",
  PADDLE_CLIENT_TOKEN: "test_client_token"
};

describe("createBillingProvider", () => {
  it.each([
    [{}, "none"],
    [{ BILLING_PROVIDER: " " }, "none"],
    [
      { BILLING_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh" },
      "stripe"
    ],
    [paddle, "paddle"]
  ])("selects the provider %j names", (env, name) => {
    expect(createBillingProvider(env).name).toBe(name);
  });

  it.each([
    [
      { BILLING_PROVIDER: "stripe", STRIPE_WEBHOOK_SECRET: "wh" },
      "BILLING_PROVIDER=stripe requires STRIPE_SECRET_KEY"
    ],
    [
      { ...paddle, PADDLE_CLIENT_TOKEN: "" },
      "BILLING_PROVIDER=paddle requires PADDLE_CLIENT_TOKEN"
    ],
    [
      { ...paddle, PADDLE_ENVIRONMENT: "staging" },
      "PADDLE_ENVIRONMENT must be one of sandbox, production"
    ],
    [{ BILLING_PROVIDER: "braintree" }, 'unknown BILLING_PROVIDER "braintree"']
  ])("refuses %j at startup", (env, message) => {
    expect(() => createBillingProvider(env)).toThrow(message);
  });

  it("gives the browser Paddle's client token and the sandbox by default", () => {
    expect(createBillingProvider(paddle).clientConfig).toEqual({
      clientToken: "test_client_token",
      environment: "sandbox"
    });
  });
});
