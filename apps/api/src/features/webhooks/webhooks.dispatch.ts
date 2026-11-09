import { webhookEndpointsTable } from "@repo/db/schema";
import type { JobConnection, WebhookDelivery } from "@repo/jobs";
import { arrayContains } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { RecordOrganizationEvent } from "../../pubsub";

/** Stores one delivery job through `connection`, so it commits with that transaction. */
type DeliveryQueue = (delivery: WebhookDelivery, connection: JobConnection) => Promise<unknown>;

let deliveryQueue: DeliveryQueue | null = null;

/** The API process sets where deliveries go (the job queue); see index.ts. */
export function setWebhookDeliveryQueue(queue: DeliveryQueue | null): void {
  deliveryQueue = queue;
}

/** Enqueues one delivery on the queue the process set; rejects when none is set. */
export function enqueueWebhookDelivery(
  delivery: WebhookDelivery,
  connection: JobConnection
): Promise<unknown> {
  return deliveryQueue
    ? deliveryQueue(delivery, connection)
    : Promise.reject(new Error("webhook delivery queue is not set"));
}

export interface WebhookDispatcherDeps {
  enqueue: DeliveryQueue;
  now?: () => Date;
}

// Event payloads hold Dates; the job stores JSON, so the event is serialized once here.
const jsonObject = z.record(z.string(), z.unknown());

/**
 * Stores one `webhook.deliver` job per Webhook Endpoint of the scope's
 * Organization that subscribes to the event, in the caller's transaction: the
 * deliveries exist only if the write that caused them commits. A failed lookup
 * or enqueue rejects, so the write fails instead of losing its event. A
 * receiver deduplicates by event id, because a delivery can be retried.
 */
export function createWebhookDispatcher({
  enqueue,
  now = () => new Date()
}: WebhookDispatcherDeps): RecordOrganizationEvent {
  return async (tx, eventType, ...[payload]) => {
    const endpoints = await tx.selectFrom(
      webhookEndpointsTable,
      arrayContains(webhookEndpointsTable.eventTypes, [eventType])
    );

    if (endpoints.length === 0) {
      return;
    }

    const { organizationId } = tx.stamp();
    const eventId = randomUUID();
    const occurredAt = now().toISOString();
    const data = jsonObject.parse(JSON.parse(JSON.stringify(payload)));
    const connection = tx.jobConnection();

    // One at a time: the statements share the transaction's single connection.
    for (const endpoint of endpoints) {
      await enqueue(
        { data, endpointId: endpoint.id, eventId, eventType, occurredAt, organizationId },
        connection
      );
    }
  };
}
