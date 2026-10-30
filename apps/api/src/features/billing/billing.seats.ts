import {
  ACCESS_GRANTING_STATUSES,
  BILLING_PLANS,
  isPlanKey,
  isSubscriptionStatus,
  type BillingProvider
} from "@repo/billing";
import { billingSubscriptionsTable, membersTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { Logger } from "@repo/logger";
import { and, count, eq, sql } from "drizzle-orm";

import { BILLING_CONFIG } from "./billing.definition";
import { formatLoggableError } from "../../observability";

interface SeatSubscription {
  id: string;
  organizationId: string;
  providerSubscriptionId: string;
  quantity: number;
}

export interface SeatSync {
  /**
   * Sets the provider quantity of the Organization's live per-seat
   * subscriptions to its member count. Throws when the provider refuses, so
   * the job runner retries.
   */
  syncOrganization: (organizationId: string) => Promise<void>;
  /**
   * Syncs every live per-seat subscription whose quantity drifted, such as
   * after an account deletion or a member leaving, which fire no hook. Runs
   * only where it holds the reconcile lock; one failure never stops the rest.
   */
  reconcile: () => Promise<{ synced: number; failed: number }>;
}

export function createSeatSync({
  db,
  provider,
  logger
}: {
  db: Database;
  provider: BillingProvider;
  logger: Pick<Logger, "warn">;
}): SeatSync {
  async function liveSeatSubscriptions(
    database: Database,
    organizationId?: string
  ): Promise<SeatSubscription[]> {
    const rows = await database
      .select()
      .from(billingSubscriptionsTable)
      .where(
        and(
          eq(billingSubscriptionsTable.provider, provider.name),
          organizationId ? eq(billingSubscriptionsTable.organizationId, organizationId) : undefined
        )
      );

    return rows.filter(
      (row) =>
        isPlanKey(row.planKey) &&
        BILLING_PLANS[row.planKey].pricing === "perSeat" &&
        isSubscriptionStatus(row.status) &&
        ACCESS_GRANTING_STATUSES.has(row.status)
    );
  }

  /** Whether the quantity changed. */
  async function sync(database: Database, subscription: SeatSubscription): Promise<boolean> {
    const [members] = await database
      .select({ total: count() })
      .from(membersTable)
      .where(eq(membersTable.organizationId, subscription.organizationId));
    const seats = Math.max(members?.total ?? 0, 1);

    if (seats === subscription.quantity) {
      return false;
    }

    await provider.updateQuantity(subscription.providerSubscriptionId, seats);
    // The provider's webhook stores the same quantity; this keeps the row
    // right if that webhook is late.
    await database
      .update(billingSubscriptionsTable)
      .set({ quantity: seats, updatedAt: new Date() })
      .where(eq(billingSubscriptionsTable.id, subscription.id));
    return true;
  }

  return {
    async syncOrganization(organizationId) {
      if (provider.name === "none") {
        return;
      }

      for (const subscription of await liveSeatSubscriptions(db, organizationId)) {
        await sync(db, subscription);
      }
    },
    async reconcile() {
      const counts = { synced: 0, failed: 0 };

      if (provider.name === "none") {
        return counts;
      }

      await db.transaction(async (tx) => {
        const result: unknown = await tx.execute(
          sql`select pg_try_advisory_xact_lock(${BILLING_CONFIG.seatReconcileLockKey}) as locked`
        );
        const locked =
          typeof result === "object" &&
          result !== null &&
          "rows" in result &&
          Array.isArray(result.rows) &&
          typeof result.rows[0] === "object" &&
          result.rows[0] !== null &&
          "locked" in result.rows[0] &&
          result.rows[0].locked === true;

        if (!locked) {
          return;
        }

        for (const subscription of await liveSeatSubscriptions(tx)) {
          try {
            if (await sync(tx, subscription)) {
              counts.synced += 1;
            }
          } catch (error) {
            counts.failed += 1;
            logger.warn(
              {
                organizationId: subscription.organizationId,
                error: formatLoggableError(error)
              },
              "billing seat reconcile failed for an organization"
            );
          }
        }
      });

      return counts;
    }
  };
}

/** Calls `reconcile` every `intervalMs`, one run at a time. Returns a stop function. */
export function startSeatReconcile({
  intervalMs,
  logger,
  reconcile
}: {
  intervalMs: number;
  logger: Pick<Logger, "error" | "info">;
  reconcile: SeatSync["reconcile"];
}): () => void {
  let running = false;

  const timer = setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    reconcile()
      .then((counts) => {
        if (counts.synced > 0 || counts.failed > 0) {
          logger.info(counts, "billing seat reconcile finished");
        }
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, "billing seat reconcile failed");
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
