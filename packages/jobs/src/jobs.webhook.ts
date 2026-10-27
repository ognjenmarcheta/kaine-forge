import { z } from "zod";

import { defineJob } from "./jobs.definition";

export const WEBHOOK_JOB = defineJob({
  // One event for one Webhook Endpoint. `data` is the event payload as JSON;
  // every attempt sends the same body.
  payload: z.object({
    endpointId: z.uuid(),
    organizationId: z.uuid(),
    eventId: z.uuid(),
    eventType: z.string(),
    occurredAt: z.string(),
    data: z.record(z.string(), z.unknown())
  }),
  // pg-boss waits 30 s * 2^n * (1 + jitter) after failed attempt n (0-5), so
  // the last of 6 attempts runs about 30-60 min after the first.
  retry: { limit: 5, delaySeconds: 30, backoff: true, maxDelaySeconds: 60 * 60 },
  // The payload holds Organization data; the delivery log keeps the outcome.
  retention: { deleteAfterSeconds: 60 * 60, pendingSeconds: 60 * 60 * 24 }
});

export type WebhookDelivery = z.infer<typeof WEBHOOK_JOB.payload>;
