import { BILLING_PROVIDERS } from "./billing.definition";
import { createNoneBillingProvider } from "./billing.none";
import type { BillingProvider } from "./billing.type";

export function createBillingProvider(
  env: Record<string, string | undefined> = process.env
): BillingProvider {
  const provider = env.BILLING_PROVIDER?.trim() || BILLING_PROVIDERS.NONE;

  if (provider === BILLING_PROVIDERS.NONE) {
    return createNoneBillingProvider();
  }

  throw new Error(
    `unknown BILLING_PROVIDER "${provider}"; implement BillingProvider for it and register the provider in createBillingProvider`
  );
}
