export const BILLING_PROVIDERS = {
  NONE: "none",
  STRIPE: "stripe",
  PADDLE: "paddle"
} as const;

export type BillingProviderName = (typeof BILLING_PROVIDERS)[keyof typeof BILLING_PROVIDERS];

export const BILLING_INTERVALS = ["month", "year"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Boolean capabilities a Plan grants. */
export const BILLING_FEATURES = ["assistant"] as const;

export type BillingFeature = (typeof BILLING_FEATURES)[number];

/** Countable resources a Plan caps per Organization. */
export const BILLING_LIMITS = ["todos"] as const;

export type BillingLimit = (typeof BILLING_LIMITS)[number];

/**
 * A provider's subscription status, normalized. Stripe's `incomplete_expired`
 * becomes `expired`; Paddle uses a subset.
 */
export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
  "incomplete",
  "expired"
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Statuses that keep the subscribed Plan; the provider runs dunning during `past_due`. */
export const ACCESS_GRANTING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
  "past_due"
]);

export interface PlanDefinition {
  /** Higher is more capable; picks the best of several subscriptions. */
  rank: number;
  pricing: "flat" | "perSeat";
  /** Whether an owner can buy it; `free` and `unlimited` are never sold. */
  purchasable: boolean;
  /** `null` is unlimited. */
  limits: Record<BillingLimit, number | null>;
  features: readonly BillingFeature[];
}

/**
 * The Plan catalog: what each Plan allows. What it costs lives at the
 * provider; env maps each purchasable Plan and interval to a price ID.
 * `unlimited` applies to every Organization while billing is off.
 */
export const BILLING_PLANS = {
  free: { rank: 0, pricing: "flat", purchasable: false, limits: { todos: 50 }, features: [] },
  pro: {
    rank: 1,
    pricing: "flat",
    purchasable: true,
    limits: { todos: null },
    features: ["assistant"]
  },
  business: {
    rank: 2,
    pricing: "perSeat",
    purchasable: true,
    limits: { todos: null },
    features: ["assistant"]
  },
  unlimited: {
    rank: 3,
    pricing: "flat",
    purchasable: false,
    limits: { todos: null },
    features: ["assistant"]
  }
} as const satisfies Record<string, PlanDefinition>;

export type PlanKey = keyof typeof BILLING_PLANS;

/** The GraphQL error code of a create past the Plan's limit. */
export const PLAN_LIMIT_REACHED = "PLAN_LIMIT_REACHED";

/** The GraphQL error code of a feature the Plan does not include. */
export const PLAN_FEATURE_REQUIRED = "PLAN_FEATURE_REQUIRED";
