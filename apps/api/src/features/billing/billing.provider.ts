import { createBillingProvider, resolvePriceCatalog } from "@repo/billing";

/** One payment provider per deployment, chosen by BILLING_PROVIDER (default none). */
export const billingProvider = createBillingProvider(process.env);

/** Purchasable Plans mapped to the provider's price IDs (`BILLING_PRICE_<PLAN>_<INTERVAL>`). */
export const billingPrices = resolvePriceCatalog(process.env);
