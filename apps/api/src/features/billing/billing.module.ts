import {
  BILLING_LIMITS,
  BILLING_PROVIDERS,
  isPlanKey,
  isSubscriptionStatus,
  PLAN_FEATURE_REQUIRED,
  PLAN_LIMIT_REACHED,
  requiredPlanForFeature,
  requiredPlanForLimit,
  resolveEntitlements,
  type BillingFeature,
  type BillingLimit,
  type BillingProviderName,
  type Entitlements,
  type PlanKey,
  type SubscriptionStatus
} from "@repo/billing";
import { billingSubscriptionsTable } from "@repo/db/schema";
import { desc } from "drizzle-orm";
import { GraphQLError } from "graphql";

import type { ScopedData } from "../../context.data";

export interface BillingModuleDeps {
  data: ScopedData;
  provider: BillingProviderName;
  /** How much of each limit the Active Organization uses, outside any transaction. */
  usage: Record<BillingLimit, () => Promise<number>>;
  now?: () => Date;
}

interface StoredSubscription {
  planKey: PlanKey;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
}

export interface BillingLimitUsage {
  key: BillingLimit;
  max: number | null;
  used: number;
}

export interface BillingStatus {
  provider: BillingProviderName;
  plan: PlanKey;
  subscriptionStatus: SubscriptionStatus | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  features: readonly BillingFeature[];
  limits: BillingLimitUsage[];
}

/**
 * The Active Organization's Plan for one request. Entitlements load once per
 * request and never cache across requests, so a webhook's change applies to
 * the next request.
 */
export interface Billing {
  entitlements: () => Promise<Entitlements>;
  status: () => Promise<BillingStatus>;
  /** Throws a PLAN_FEATURE_REQUIRED error unless the Plan includes the feature. */
  requireFeature: (feature: BillingFeature) => Promise<void>;
  /**
   * Runs `create` in one transaction that first locks the limit for the
   * Organization, counts its usage with `countUsed`, and throws a
   * PLAN_LIMIT_REACHED error when one more would pass the cap. The lock holds
   * until commit, so a parallel create counts this one. An unlimited Plan
   * runs `create` directly.
   */
  withinLimit: <TResult>(
    limit: BillingLimit,
    countUsed: (tx: ScopedData) => Promise<number>,
    create: (tx: ScopedData) => Promise<TResult>
  ) => Promise<TResult>;
}

export function createBilling({
  data,
  provider,
  usage,
  now = () => new Date()
}: BillingModuleDeps): Billing {
  let subscriptions: Promise<StoredSubscription[]> | undefined;
  let entitlements: Promise<Entitlements> | undefined;

  function loadSubscriptions(): Promise<StoredSubscription[]> {
    // Billing off: every Organization has the unlimited Plan, so read nothing.
    if (provider === BILLING_PROVIDERS.NONE) {
      return Promise.resolve([]);
    }

    subscriptions ??= data
      .selectFrom(billingSubscriptionsTable)
      .orderBy(desc(billingSubscriptionsTable.updatedAt))
      .then((rows) =>
        rows.flatMap(({ planKey, status, cancelAtPeriodEnd, currentPeriodEnd }) =>
          // Webhooks store only catalog Plans and known statuses; skip anything else.
          isPlanKey(planKey) && isSubscriptionStatus(status)
            ? [{ planKey, status, cancelAtPeriodEnd, currentPeriodEnd }]
            : []
        )
      );
    return subscriptions;
  }

  function loadEntitlements(): Promise<Entitlements> {
    entitlements ??= loadSubscriptions().then((rows) =>
      resolveEntitlements({ provider, subscriptions: rows, now: now() })
    );
    return entitlements;
  }

  return {
    entitlements: loadEntitlements,
    async status() {
      const [rows, current] = await Promise.all([loadSubscriptions(), loadEntitlements()]);
      // The subscription that grants the Plan, else the latest one.
      const subscription = rows.find((row) => row.planKey === current.planKey) ?? rows[0] ?? null;
      const limits = await Promise.all(
        BILLING_LIMITS.map(async (key) => ({
          key,
          max: current.limits[key],
          used: await usage[key]()
        }))
      );

      return {
        provider,
        plan: current.planKey,
        subscriptionStatus: subscription?.status ?? null,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
        features: current.features,
        limits
      };
    },
    async requireFeature(feature) {
      const { features } = await loadEntitlements();

      if (!features.includes(feature)) {
        throw new GraphQLError(`the current plan does not include ${feature}`, {
          extensions: {
            code: PLAN_FEATURE_REQUIRED,
            feature,
            requiredPlan: requiredPlanForFeature(feature)
          }
        });
      }
    },
    async withinLimit(limit, countUsed, create) {
      // Read before the transaction: it runs on the request's own connection.
      const max = (await loadEntitlements()).limits[limit];

      if (max === null) {
        return create(data);
      }

      return data.transaction(async (tx) => {
        await tx.lockOrganization(`billing:${limit}`);
        const used = await countUsed(tx);

        if (used >= max) {
          throw new GraphQLError(`the current plan allows at most ${max} ${limit}`, {
            extensions: {
              code: PLAN_LIMIT_REACHED,
              feature: limit,
              limit: max,
              requiredPlan: requiredPlanForLimit(limit, used)
            }
          });
        }

        return create(tx);
      });
    }
  };
}
