import {
  Environment,
  EventName,
  Paddle,
  type EventEntity,
  type Subscription
} from "@paddle/paddle-node-sdk";

import { BILLING_PROVIDERS } from "./billing.definition";
import { UnknownPriceError, type PriceCatalog } from "./billing.prices";
import type { BillingProvider, NormalizedSubscription } from "./billing.type";

export const PADDLE_ENVIRONMENTS = ["sandbox", "production"] as const;

export type PaddleEnvironment = (typeof PADDLE_ENVIRONMENTS)[number];

/** The Paddle subscription fields the catalog reads. */
export type PaddleSubscriptionFields = Pick<
  Subscription,
  "id" | "status" | "customerId" | "customData" | "currentBillingPeriod" | "scheduledChange"
> & {
  items: { price: { id: string }; quantity: number; trialDates: { endsAt: string } | null }[];
};

function organizationIdOf(customData: Record<string, unknown> | null): string | null {
  const value = customData?.organization_id;
  return typeof value === "string" ? value : null;
}

/**
 * A Paddle subscription in catalog terms. Throws UnknownPriceError for a price
 * outside the catalog, so a webhook never stores a Plan it cannot name.
 */
export function normalizePaddleSubscription(
  subscription: PaddleSubscriptionFields,
  prices: PriceCatalog
): NormalizedSubscription {
  const item = subscription.items[0];

  if (!item) {
    throw new Error(`paddle subscription ${subscription.id} has no items`);
  }

  const plan = prices.planOf(item.price.id);

  if (!plan) {
    throw new UnknownPriceError(item.price.id);
  }

  const periodEnd = subscription.currentBillingPeriod?.endsAt;
  const trialEnd = item.trialDates?.endsAt;

  return {
    providerSubscriptionId: subscription.id,
    providerCustomerId: subscription.customerId,
    organizationId: organizationIdOf(subscription.customData),
    planKey: plan.planKey,
    interval: plan.interval,
    // Paddle's statuses are a subset of the normalized ones.
    status: subscription.status,
    quantity: item.quantity,
    currentPeriodEnd: periodEnd ? new Date(periodEnd) : null,
    cancelAtPeriodEnd: subscription.scheduledChange?.action === "cancel",
    trialEndsAt: trialEnd ? new Date(trialEnd) : null
  };
}

function subscriptionRefOf(event: EventEntity): string | null {
  switch (event.eventType) {
    case EventName.SubscriptionActivated:
    case EventName.SubscriptionCanceled:
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionPastDue:
    case EventName.SubscriptionPaused:
    case EventName.SubscriptionResumed:
    case EventName.SubscriptionTrialing:
    case EventName.SubscriptionUpdated:
      return event.data.id;
    case EventName.TransactionCompleted:
      return event.data.subscriptionId;
    default:
      return null;
  }
}

export interface PaddleBillingProviderConfig {
  apiKey: string;
  webhookSecret: string;
  clientToken: string;
  environment: PaddleEnvironment;
  prices: PriceCatalog;
}

export function createPaddleBillingProvider(config: PaddleBillingProviderConfig): BillingProvider {
  const paddle = new Paddle(config.apiKey, {
    environment: config.environment === "sandbox" ? Environment.sandbox : Environment.production
  });

  return {
    name: BILLING_PROVIDERS.PADDLE,
    clientConfig: { clientToken: config.clientToken, environment: config.environment },
    async createCustomer({ organizationId, name, email }) {
      // Paddle keeps one customer per email address: an owner's
      // Organizations share it, and each keeps its own subscription.
      const [existing] = await paddle.customers.list({ email: [email] }).next();

      if (existing) {
        return existing.id;
      }

      const customer = await paddle.customers.create({
        email,
        name,
        customData: { organization_id: organizationId }
      });
      return customer.id;
    },
    async createCheckout({ customerRef, organizationId, priceId, quantity }) {
      // Paddle.js opens the overlay for this transaction and owns the return
      // URLs; the subscription it creates inherits the custom data.
      const transaction = await paddle.transactions.create({
        items: [{ priceId, quantity }],
        customerId: customerRef,
        customData: { organization_id: organizationId }
      });
      return { kind: "overlay", transactionId: transaction.id };
    },
    async createPortalSession({ customerRef }) {
      const session = await paddle.customerPortalSessions.create(customerRef, []);
      return { url: session.urls.general.overview };
    },
    async fetchSubscription(subscriptionRef) {
      return normalizePaddleSubscription(
        await paddle.subscriptions.get(subscriptionRef),
        config.prices
      );
    },
    async updateQuantity(subscriptionRef, quantity) {
      const item = (await paddle.subscriptions.get(subscriptionRef)).items[0];

      if (!item) {
        throw new Error(`paddle subscription ${subscriptionRef} has no items`);
      }

      await paddle.subscriptions.update(subscriptionRef, {
        items: [{ priceId: item.price.id, quantity }],
        prorationBillingMode: "prorated_immediately"
      });
    },
    async cancelNow(subscriptionRef) {
      await paddle.subscriptions.cancel(subscriptionRef, { effectiveFrom: "immediately" });
    },
    async verifyWebhook(rawBody, headers) {
      const signature = headers["paddle-signature"];

      if (!signature) {
        throw new Error("missing paddle-signature header");
      }

      const event = await paddle.webhooks.unmarshal(rawBody, config.webhookSecret, signature);
      return { eventId: event.eventId, subscriptionRef: subscriptionRefOf(event) };
    }
  };
}
