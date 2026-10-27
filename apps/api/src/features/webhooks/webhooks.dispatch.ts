import { webhookEndpointsTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { WebhookDelivery } from "@repo/jobs";
import type { Logger } from "@repo/logger";
import { and, arrayContains, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { isWebhookEventType, type PubSubEventMap } from "../../pubsub";

/** Any event payload the pubsub carries; only organization events have webhooks. */
type PubSubPayload = PubSubEventMap[keyof PubSubEventMap][number];

type DeliveryQueue = (delivery: WebhookDelivery) => Promise<unknown>;

let deliveryQueue: DeliveryQueue | null = null;

/** The API process sets where deliveries go (the job queue); see index.ts. */
export function setWebhookDeliveryQueue(queue: DeliveryQueue | null): void {
  deliveryQueue = queue;
}

/** Enqueues one delivery on the queue the process set; rejects when none is set. */
export function enqueueWebhookDelivery(delivery: WebhookDelivery): Promise<unknown> {
  return deliveryQueue
    ? deliveryQueue(delivery)
    : Promise.reject(new Error("webhook delivery queue is not set"));
}

export interface WebhookDispatcherDeps {
  db: Database;
  enqueue: DeliveryQueue;
  logger: Pick<Logger, "error">;
  now?: () => Date;
}

// Event payloads hold Dates; the job stores JSON, so the event is serialized once here.
const jsonObject = z.record(z.string(), z.unknown());

/**
 * Enqueues one `webhook.deliver` job per Webhook Endpoint of the event's own
 * Organization that subscribes to the event. It never throws or blocks the
 * caller: a failed lookup or enqueue is logged, and the event is not delivered.
 */
export function createWebhookDispatcher({
  db,
  enqueue,
  logger,
  now = () => new Date()
}: WebhookDispatcherDeps): (eventType: string, payload: PubSubPayload) => void {
  const dispatch = async (eventType: string, organizationId: string, payload: PubSubPayload) => {
    const endpoints = await db
      .select({ id: webhookEndpointsTable.id })
      .from(webhookEndpointsTable)
      .where(
        and(
          eq(webhookEndpointsTable.organizationId, organizationId),
          arrayContains(webhookEndpointsTable.eventTypes, [eventType])
        )
      );

    if (endpoints.length === 0) {
      return;
    }

    const eventId = randomUUID();
    const occurredAt = now().toISOString();
    const data = jsonObject.parse(JSON.parse(JSON.stringify(payload)));

    await Promise.all(
      endpoints.map((endpoint) =>
        enqueue({ data, endpointId: endpoint.id, eventId, eventType, occurredAt, organizationId })
      )
    );
  };

  return (eventType, payload) => {
    if (
      !isWebhookEventType(eventType) ||
      !("organizationId" in payload) ||
      typeof payload.organizationId !== "string"
    ) {
      return;
    }

    dispatch(eventType, payload.organizationId, payload).catch((error: unknown) => {
      logger.error({ err: error, eventType }, "webhook event not dispatched");
    });
  };
}
