import { z } from "zod";

import { defineJob } from "./jobs.definition";

export const BILLING_SEATS_JOB = defineJob({
  // Sets the provider quantity of the Organization's per-seat subscription
  // to its member count; a run for an Organization without one does nothing.
  payload: z.object({ organizationId: z.uuid() }),
  // pg-boss waits 30 s * 2^n after failed attempt n, so a provider outage of
  // up to about an hour still ends in the right quantity.
  retry: { limit: 5, delaySeconds: 30, backoff: true, maxDelaySeconds: 60 * 60 },
  retention: { deleteAfterSeconds: 60 * 60, pendingSeconds: 60 * 60 * 24 }
});

export type BillingSeatsJobPayload = z.infer<typeof BILLING_SEATS_JOB.payload>;
