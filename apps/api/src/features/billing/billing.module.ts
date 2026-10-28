import type { recordAuditEvent } from "@repo/auth/audit";
import {
  requireOrganizationPermission,
  type AuthenticatedOrganizationScope
} from "@repo/auth/scope";
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
  BILLING_PLANS,
  type BillingFeature,
  type BillingInterval,
  type BillingLimit,
  type BillingProvider,
  type BillingProviderName,
  type CheckoutResult,
  type PriceCatalog,
  type Entitlements,
  type PlanKey,
  type SubscriptionStatus
} from "@repo/billing";
import {
  billingCustomersTable,
  billingSubscriptionsTable,
  membersTable,
  organizationsTable
} from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { count, desc, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { BILLING_CONFIG } from "./billing.definition";
import type { ScopedData } from "../../context.data";

export interface BillingModuleDeps {
  data: ScopedData;
  db: Database;
  provider: BillingProvider;
  prices: PriceCatalog;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
  recordAuditEvent: typeof recordAuditEvent;
  /** Origin of the web app that checkout and the portal return to. */
  webAppUrl: string | undefined;
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
  /**
   * Starts a provider checkout of a purchasable Plan for the Active
   * Organization. Requires billing:manage; creates the provider customer on
   * first use. An Organization that already has a paid Plan changes it in
   * the portal instead.
   */
  startCheckout: (planKey: PlanKey, interval: BillingInterval) => Promise<CheckoutResult>;
  /** A provider portal URL for the Active Organization. Requires billing:manage. */
  openPortal: () => Promise<string>;
}

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export function createBilling({
  data,
  db,
  provider: billingProvider,
  prices,
  requireOrganizationScope,
  recordAuditEvent,
  webAppUrl,
  usage,
  now = () => new Date()
}: BillingModuleDeps): Billing {
  const provider: BillingProviderName = billingProvider.name;
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

  function requireManager(): AuthenticatedOrganizationScope {
    const scope = requireOrganizationScope();
    requireOrganizationPermission(scope, "billing:manage");
    return scope;
  }

  function requireReturnUrl(): string {
    if (!webAppUrl) {
      throw new Error("WEB_APP_URL is required for billing checkout and the portal");
    }
    return new URL(BILLING_CONFIG.returnPath, webAppUrl).toString();
  }

  /** The Organization's provider customer, created once under a lock so two checkouts share it. */
  async function ensureCustomer(scope: AuthenticatedOrganizationScope): Promise<string> {
    const [organization] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, scope.organizationId))
      .limit(1);

    return data.transaction(async (tx) => {
      await tx.lockOrganization("billing:customer");
      const [existing] = await tx.selectFrom(billingCustomersTable).limit(1);

      if (existing) {
        return existing.providerCustomerId;
      }

      const providerCustomerId = await billingProvider.createCustomer({
        organizationId: scope.organizationId,
        name: organization?.name ?? scope.organizationId,
        email: scope.user.email
      });
      await tx
        .insert(billingCustomersTable)
        .values({ ...tx.stamp(), provider: billingProvider.name, providerCustomerId });
      return providerCustomerId;
    });
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
    },
    async startCheckout(planKey, interval) {
      const scope = requireManager();
      const returnUrl = requireReturnUrl();
      const plan = BILLING_PLANS[planKey];
      const priceId = plan.purchasable ? prices.priceId(planKey, interval) : null;

      if (!priceId) {
        throw badInput(`the ${planKey} plan is not for sale with a ${interval} interval`);
      }

      if ((await loadEntitlements()).planKey !== "free") {
        throw badInput("the organization already has a paid plan; change it in the billing portal");
      }

      const customerRef = await ensureCustomer(scope);
      const [members] =
        plan.pricing === "perSeat" ? await data.aggregate(membersTable, { total: count() }) : [];
      const checkout = await billingProvider.createCheckout({
        customerRef,
        organizationId: scope.organizationId,
        priceId,
        quantity: members?.total ?? 1,
        successUrl: `${returnUrl}?checkout=success`,
        cancelUrl: `${returnUrl}?checkout=canceled`
      });

      await recordAuditEvent({
        action: "billing_checkout_started",
        actorUserId: scope.userId,
        metadata: { plan: planKey, interval },
        organizationId: scope.organizationId,
        targetId: scope.organizationId
      });
      return checkout;
    },
    async openPortal() {
      const scope = requireManager();
      const returnUrl = requireReturnUrl();
      const [customer] = await data.selectFrom(billingCustomersTable).limit(1);

      if (!customer) {
        throw badInput("the organization has no billing account yet");
      }

      const { url } = await billingProvider.createPortalSession({
        customerRef: customer.providerCustomerId,
        returnUrl
      });

      await recordAuditEvent({
        action: "billing_portal_opened",
        actorUserId: scope.userId,
        metadata: {},
        organizationId: scope.organizationId,
        targetId: scope.organizationId
      });
      return url;
    }
  };
}
