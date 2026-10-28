import {
  BILLING_INTERVALS,
  BILLING_PLANS,
  type BillingInterval,
  type PlanKey
} from "./billing.definition";
import { isPlanKey } from "./billing.util";

/** Maps purchasable Plans to provider price IDs and back; env holds the IDs. */
export interface PriceCatalog {
  priceId(planKey: PlanKey, interval: BillingInterval): string | null;
  planOf(priceId: string): { planKey: PlanKey; interval: BillingInterval } | null;
}

/** A price ID the catalog does not know: never mapped to a Plan, so never stored. */
export class UnknownPriceError extends Error {
  constructor(priceId: string) {
    super(
      `price ${priceId} is not in the billing catalog; set BILLING_PRICE_<PLAN>_<INTERVAL> for it`
    );
    this.name = "UnknownPriceError";
  }
}

/** `BILLING_PRICE_PRO_MONTH`, `BILLING_PRICE_BUSINESS_YEAR`, and so on. */
export function priceEnvKey(planKey: PlanKey, interval: BillingInterval): string {
  return `BILLING_PRICE_${planKey.toUpperCase()}_${interval.toUpperCase()}`;
}

export function resolvePriceCatalog(env: Record<string, string | undefined>): PriceCatalog {
  const entries = Object.keys(BILLING_PLANS)
    .filter(isPlanKey)
    .filter((planKey) => BILLING_PLANS[planKey].purchasable)
    .flatMap((planKey) =>
      BILLING_INTERVALS.flatMap((interval) => {
        const priceId = env[priceEnvKey(planKey, interval)]?.trim();
        return priceId ? [{ planKey, interval, priceId }] : [];
      })
    );

  return {
    priceId: (planKey, interval) =>
      entries.find((entry) => entry.planKey === planKey && entry.interval === interval)?.priceId ??
      null,
    planOf: (priceId) => {
      const entry = entries.find((candidate) => candidate.priceId === priceId);
      return entry ? { planKey: entry.planKey, interval: entry.interval } : null;
    }
  };
}
