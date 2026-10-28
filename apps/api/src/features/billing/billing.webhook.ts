import type { recordAuditEvent } from "@repo/auth/audit";
import type { BillingProvider } from "@repo/billing";
import {
  billingCustomersTable,
  billingEventsTable,
  billingSubscriptionsTable,
  organizationsTable
} from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { Logger } from "@repo/logger";
import { and, eq } from "drizzle-orm";

import { formatLoggableError } from "../../observability";

export interface BillingWebhookDeps {
  db: Database;
  provider: BillingProvider;
  recordAuditEvent: typeof recordAuditEvent;
  logger: Pick<Logger, "warn">;
}

/**
 * Handles one provider webhook delivery and returns its HTTP status. A
 * delivery names a subscription; the handler refetches it from the provider
 * and stores that state, so order and repeats never matter. The event id is
 * recorded only after success, so a failed delivery is processed again when
 * the provider retries. Throws on a processing failure, which answers 500.
 */
export function createBillingWebhookHandler({
  db,
  provider,
  recordAuditEvent,
  logger
}: BillingWebhookDeps): (
  providerName: string,
  rawBody: string,
  headers: Record<string, string | undefined>
) => Promise<number> {
  async function resolveOrganizationId(
    organizationId: string | null,
    providerCustomerId: string
  ): Promise<string | null> {
    if (organizationId) {
      return organizationId;
    }

    const [customer] = await db
      .select({ organizationId: billingCustomersTable.organizationId })
      .from(billingCustomersTable)
      .where(
        and(
          eq(billingCustomersTable.provider, provider.name),
          eq(billingCustomersTable.providerCustomerId, providerCustomerId)
        )
      )
      .limit(1);
    return customer?.organizationId ?? null;
  }

  async function storeSubscription(subscriptionRef: string): Promise<void> {
    const subscription = await provider.fetchSubscription(subscriptionRef);
    const organizationId = await resolveOrganizationId(
      subscription.organizationId,
      subscription.providerCustomerId
    );
    const [organization] = organizationId
      ? await db
          .select({ id: organizationsTable.id })
          .from(organizationsTable)
          .where(eq(organizationsTable.id, organizationId))
          .limit(1)
      : [];

    // A subscription made outside checkout, or of a deleted Organization:
    // nothing here can own it, and a retry would not change that.
    if (!organization) {
      logger.warn(
        { provider: provider.name, subscriptionRef },
        "billing webhook names a subscription of no known organization"
      );
      return;
    }

    const values = {
      planKey: subscription.planKey,
      interval: subscription.interval,
      status: subscription.status,
      quantity: subscription.quantity,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      updatedAt: new Date()
    };

    await db.transaction(async (tx) => {
      await tx
        .insert(billingCustomersTable)
        .values({
          organizationId: organization.id,
          provider: provider.name,
          providerCustomerId: subscription.providerCustomerId
        })
        .onConflictDoNothing();
      await tx
        .insert(billingSubscriptionsTable)
        .values({
          organizationId: organization.id,
          provider: provider.name,
          providerSubscriptionId: subscription.providerSubscriptionId,
          ...values
        })
        .onConflictDoUpdate({
          target: [
            billingSubscriptionsTable.provider,
            billingSubscriptionsTable.providerSubscriptionId
          ],
          set: values
        });
    });

    await recordAuditEvent({
      action: "billing_subscription_changed",
      actorUserId: null,
      metadata: { plan: subscription.planKey, status: subscription.status },
      organizationId: organization.id,
      targetId: organization.id
    });
  }

  return async (providerName, rawBody, headers) => {
    if (providerName !== provider.name || provider.name === "none") {
      return 404;
    }

    let verified: Awaited<ReturnType<BillingProvider["verifyWebhook"]>>;
    try {
      verified = await provider.verifyWebhook(rawBody, headers);
    } catch (error) {
      logger.warn(
        { provider: provider.name, error: formatLoggableError(error) },
        "billing webhook signature rejected"
      );
      return 400;
    }

    const [seen] = await db
      .select({ eventId: billingEventsTable.eventId })
      .from(billingEventsTable)
      .where(
        and(
          eq(billingEventsTable.provider, provider.name),
          eq(billingEventsTable.eventId, verified.eventId)
        )
      )
      .limit(1);

    if (seen) {
      return 200;
    }

    if (verified.subscriptionRef) {
      await storeSubscription(verified.subscriptionRef);
    }

    await db
      .insert(billingEventsTable)
      .values({ provider: provider.name, eventId: verified.eventId })
      .onConflictDoNothing();
    return 200;
  };
}
