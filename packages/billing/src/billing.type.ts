import type {
  BillingInterval,
  BillingProviderName,
  PlanKey,
  SubscriptionStatus
} from "./billing.definition";

/** A provider subscription in the shape the catalog and the database use. */
export interface NormalizedSubscription {
  providerSubscriptionId: string;
  providerCustomerId: string;
  /** From provider metadata; set when checkout created the subscription. */
  organizationId: string | null;
  planKey: PlanKey;
  interval: BillingInterval;
  status: SubscriptionStatus;
  quantity: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
}

export type CheckoutResult =
  { kind: "redirect"; url: string } | { kind: "overlay"; transactionId: string };

export interface CheckoutInput {
  customerRef: string;
  organizationId: string;
  priceId: string;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
}

export interface VerifiedWebhook {
  eventId: string;
  /** Null for an event that does not concern a subscription. */
  subscriptionRef: string | null;
}

/**
 * One payment provider behind a provider-neutral interface. Server-only:
 * implementations hold secret keys.
 */
export interface BillingProvider {
  name: BillingProviderName;
  /** Creates the Organization's customer at the provider and returns its id. */
  createCustomer(input: { organizationId: string; name: string; email: string }): Promise<string>;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  createPortalSession(input: { customerRef: string; returnUrl: string }): Promise<{ url: string }>;
  /** The provider's current state; webhooks refetch instead of trusting event order. */
  fetchSubscription(subscriptionRef: string): Promise<NormalizedSubscription>;
  updateQuantity(subscriptionRef: string, quantity: number): Promise<void>;
  cancelNow(subscriptionRef: string): Promise<void>;
  /** Throws when the signature does not match the raw body. */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>
  ): Promise<VerifiedWebhook>;
}
