import {
  ACCESS_GRANTING_STATUSES,
  BILLING_PLANS,
  BILLING_PROVIDERS,
  type BillingFeature,
  type BillingLimit,
  type BillingProviderName,
  type PlanKey,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus
} from "./billing.definition";

/** The fields of a stored subscription that decide access. */
export interface SubscriptionAccess {
  planKey: PlanKey;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
}

export interface Entitlements {
  planKey: PlanKey;
  limits: Record<BillingLimit, number | null>;
  features: readonly BillingFeature[];
}

function grantsAccess(subscription: SubscriptionAccess, now: Date): boolean {
  if (!ACCESS_GRANTING_STATUSES.has(subscription.status)) {
    return false;
  }

  // A cancellation at period end keeps the Plan until then. Past it, the
  // Plan ends even if the provider's final `canceled` event never arrived.
  return !(
    subscription.cancelAtPeriodEnd &&
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd <= now
  );
}

function entitlementsOf(planKey: PlanKey): Entitlements {
  const plan = BILLING_PLANS[planKey];
  return { planKey, limits: plan.limits, features: plan.features };
}

/**
 * The Plan an Organization gets: `unlimited` while billing is off, else the
 * best Plan among its subscriptions that still grant access, else `free`.
 */
export function resolveEntitlements(input: {
  provider: BillingProviderName;
  subscriptions: readonly SubscriptionAccess[];
  now: Date;
}): Entitlements {
  if (input.provider === BILLING_PROVIDERS.NONE) {
    return entitlementsOf("unlimited");
  }

  const best = input.subscriptions
    .filter((subscription) => grantsAccess(subscription, input.now))
    .map((subscription) => subscription.planKey)
    .sort((a, b) => BILLING_PLANS[b].rank - BILLING_PLANS[a].rank)[0];

  return entitlementsOf(best ?? "free");
}

export function isPlanKey(value: string): value is PlanKey {
  return Object.hasOwn(BILLING_PLANS, value);
}

const SUBSCRIPTION_STATUS_SET: ReadonlySet<string> = new Set(SUBSCRIPTION_STATUSES);

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return SUBSCRIPTION_STATUS_SET.has(value);
}

const PURCHASABLE_PLANS = Object.keys(BILLING_PLANS)
  .filter(isPlanKey)
  .filter((key) => BILLING_PLANS[key].purchasable)
  .sort((a, b) => BILLING_PLANS[a].rank - BILLING_PLANS[b].rank);

/** The cheapest Plan an owner can buy that includes the feature. */
export function requiredPlanForFeature(feature: BillingFeature): PlanKey | null {
  return (
    PURCHASABLE_PLANS.find((key) => {
      const features: readonly BillingFeature[] = BILLING_PLANS[key].features;
      return features.includes(feature);
    }) ?? null
  );
}

/** The cheapest Plan an owner can buy whose limit allows more than `used`. */
export function requiredPlanForLimit(limit: BillingLimit, used: number): PlanKey | null {
  return (
    PURCHASABLE_PLANS.find((key) => {
      const cap: number | null = BILLING_PLANS[key].limits[limit];
      return cap === null || cap > used;
    }) ?? null
  );
}
