import Stripe from "stripe";

import { BILLING_PROVIDERS, type SubscriptionStatus } from "./billing.definition";
import { UnknownPriceError, type PriceCatalog } from "./billing.prices";
import type { BillingProvider, NormalizedSubscription } from "./billing.type";

/** The API version stripe@23 pins; the dashboard webhook endpoint must use it too. */
export const STRIPE_API_VERSION = "2026-09-30.endive";

const STRIPE_STATUSES: Readonly<Record<string, SubscriptionStatus>> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
  paused: "paused",
  incomplete: "incomplete",
  incomplete_expired: "expired"
};

function fromUnixSeconds(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

/** The Stripe subscription fields the catalog reads. */
export type StripeSubscriptionFields = Pick<
  Stripe.Subscription,
  "id" | "customer" | "metadata" | "status" | "cancel_at_period_end" | "cancel_at" | "trial_end"
> & {
  items: {
    data: (Pick<Stripe.SubscriptionItem, "id" | "quantity" | "current_period_end"> & {
      price: Pick<Stripe.Price, "id">;
    })[];
  };
};

/**
 * A Stripe subscription in catalog terms. Throws UnknownPriceError for a price
 * outside the catalog, so a webhook never stores a Plan it cannot name.
 */
export function normalizeStripeSubscription(
  subscription: StripeSubscriptionFields,
  prices: PriceCatalog
): NormalizedSubscription {
  const item = subscription.items.data[0];

  if (!item) {
    throw new Error(`stripe subscription ${subscription.id} has no items`);
  }

  const plan = prices.planOf(item.price.id);

  if (!plan) {
    throw new UnknownPriceError(item.price.id);
  }

  const status = STRIPE_STATUSES[subscription.status];

  if (!status) {
    throw new Error(
      `stripe subscription ${subscription.id} has unknown status ${subscription.status}`
    );
  }

  return {
    providerSubscriptionId: subscription.id,
    providerCustomerId:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    organizationId: subscription.metadata.organization_id ?? null,
    planKey: plan.planKey,
    interval: plan.interval,
    status,
    quantity: item.quantity ?? 1,
    // Since API 2025-03-31.basil the period lives on the item, not the subscription.
    currentPeriodEnd: fromUnixSeconds(item.current_period_end),
    // The portal schedules a cancellation with either field.
    cancelAtPeriodEnd: subscription.cancel_at_period_end || subscription.cancel_at !== null,
    trialEndsAt: fromUnixSeconds(subscription.trial_end)
  };
}

function subscriptionRefOf(event: Stripe.Event): string | null {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.trial_will_end":
      return event.data.object.id;
    case "checkout.session.completed": {
      const { subscription } = event.data.object;
      if (subscription === null) {
        return null;
      }
      return typeof subscription === "string" ? subscription : subscription.id;
    }
    default:
      return null;
  }
}

export interface StripeBillingProviderConfig {
  secretKey: string;
  webhookSecret: string;
  prices: PriceCatalog;
}

export function createStripeBillingProvider(config: StripeBillingProviderConfig): BillingProvider {
  const stripe = new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION });

  async function retrieve(subscriptionRef: string): Promise<Stripe.Subscription> {
    return stripe.subscriptions.retrieve(subscriptionRef);
  }

  return {
    name: BILLING_PROVIDERS.STRIPE,
    async createCustomer({ organizationId, name, email }) {
      const customer = await stripe.customers.create({
        name,
        email,
        metadata: { organization_id: organizationId }
      });
      return customer.id;
    },
    async createCheckout({
      customerRef,
      organizationId,
      priceId,
      quantity,
      successUrl,
      cancelUrl
    }) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerRef,
        client_reference_id: organizationId,
        line_items: [{ price: priceId, quantity }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: { metadata: { organization_id: organizationId } }
      });

      if (!session.url) {
        throw new Error("stripe returned a checkout session without a url");
      }

      return { kind: "redirect", url: session.url };
    },
    async createPortalSession({ customerRef, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerRef,
        return_url: returnUrl
      });
      return { url: session.url };
    },
    async fetchSubscription(subscriptionRef) {
      return normalizeStripeSubscription(await retrieve(subscriptionRef), config.prices);
    },
    async updateQuantity(subscriptionRef, quantity) {
      const item = (await retrieve(subscriptionRef)).items.data[0];

      if (!item) {
        throw new Error(`stripe subscription ${subscriptionRef} has no items`);
      }

      await stripe.subscriptions.update(subscriptionRef, { items: [{ id: item.id, quantity }] });
    },
    async cancelNow(subscriptionRef) {
      await stripe.subscriptions.cancel(subscriptionRef);
    },
    async verifyWebhook(rawBody, headers) {
      const signature = headers["stripe-signature"];

      if (!signature) {
        throw new Error("missing stripe-signature header");
      }

      const event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        config.webhookSecret
      );
      return { eventId: event.id, subscriptionRef: subscriptionRefOf(event) };
    }
  };
}
