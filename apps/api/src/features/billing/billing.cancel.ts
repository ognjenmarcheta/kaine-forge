import type { BillingProvider } from "@repo/billing";
import { billingSubscriptionsTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { Logger } from "@repo/logger";
import { and, eq, inArray, notInArray } from "drizzle-orm";

import { formatLoggableError } from "../../observability";

/** Statuses after which the provider bills nothing more. */
const ENDED_STATUSES = ["canceled", "expired"];

/**
 * Cancels at once every subscription of the Organizations that the provider
 * may still bill, before they are deleted. Throws on the first refusal, so
 * the delete fails instead of leaving a deleted Organization billed.
 */
export async function cancelOrganizationSubscriptions(
  deps: { db: Database; provider: BillingProvider; logger: Pick<Logger, "error"> },
  organizationIds: readonly string[]
): Promise<void> {
  const live = await deps.db
    .select({
      organizationId: billingSubscriptionsTable.organizationId,
      providerSubscriptionId: billingSubscriptionsTable.providerSubscriptionId
    })
    .from(billingSubscriptionsTable)
    .where(
      and(
        eq(billingSubscriptionsTable.provider, deps.provider.name),
        inArray(billingSubscriptionsTable.organizationId, [...organizationIds]),
        notInArray(billingSubscriptionsTable.status, ENDED_STATUSES)
      )
    );

  for (const subscription of live) {
    try {
      await deps.provider.cancelNow(subscription.providerSubscriptionId);
    } catch (error) {
      deps.logger.error(
        { organizationId: subscription.organizationId, error: formatLoggableError(error) },
        "billing subscription cancel failed; the organization delete is refused"
      );
      throw error;
    }
  }
}
