import {
  createNoneBillingProvider,
  resolvePriceCatalog,
  type BillingProvider,
  type BillingProviderName
} from "@repo/billing";

import { createBilling, type Billing, type BillingModuleDeps } from "./billing.module";

/** A provider that answers as `name` and fails every call the test did not override. */
export function fakeBillingProvider(
  name: BillingProviderName,
  overrides: Partial<BillingProvider> = {}
): BillingProvider {
  return { ...createNoneBillingProvider(), name, ...overrides };
}

/** The real billing module with test defaults: no audit writes, no prices, no web app. */
export function createTestBilling(
  deps: Pick<BillingModuleDeps, "data" | "db" | "requireOrganizationScope" | "usage"> &
    Partial<BillingModuleDeps>
): Billing {
  return createBilling({
    provider: fakeBillingProvider("none"),
    prices: resolvePriceCatalog({}),
    recordAuditEvent: () => Promise.resolve(),
    webAppUrl: undefined,
    ...deps
  });
}
