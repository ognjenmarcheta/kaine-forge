import { BILLING_PROVIDERS } from "./billing.definition";
import type { BillingProvider } from "./billing.type";

function notConfigured(): never {
  throw new Error("billing is not configured; set BILLING_PROVIDER to stripe or paddle");
}

/** Billing off: every Organization resolves to the unlimited Plan, and no provider call exists. */
export function createNoneBillingProvider(): BillingProvider {
  return {
    name: BILLING_PROVIDERS.NONE,
    createCustomer: async () => notConfigured(),
    createCheckout: async () => notConfigured(),
    createPortalSession: async () => notConfigured(),
    fetchSubscription: async () => notConfigured(),
    updateQuantity: async () => notConfigured(),
    cancelNow: async () => notConfigured(),
    verifyWebhook: async () => notConfigured()
  };
}
