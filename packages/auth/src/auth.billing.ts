/**
 * What billing does when memberships or Organizations change. The API sets
 * these at startup, because it owns the payment provider; without them (billing
 * off, tests, the worker) membership and deletes run with no billing step.
 */
export interface BillingHooks {
  /** Queues a seat quantity sync for the Organization; never throws. */
  syncSeats: (organizationId: string) => void;
  /** Cancels the Organizations' live provider subscriptions at once; throws when the provider refuses. */
  cancelSubscriptions: (organizationIds: readonly string[]) => Promise<void>;
}

let hooks: BillingHooks | null = null;

export function setBillingHooks(next: BillingHooks | null): void {
  hooks = next;
}

export function syncBillingSeats(organizationId: string): void {
  hooks?.syncSeats(organizationId);
}

export async function cancelBillingSubscriptions(
  organizationIds: readonly string[]
): Promise<void> {
  if (organizationIds.length > 0) {
    await hooks?.cancelSubscriptions(organizationIds);
  }
}
