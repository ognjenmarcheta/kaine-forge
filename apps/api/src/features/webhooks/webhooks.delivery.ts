import { webhookDeliveriesTable, webhookEndpointsTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { WebhookDelivery } from "@repo/jobs";
import { and, count, eq } from "drizzle-orm";

import { WEBHOOK_CONFIG, type WebhookDeliveryError } from "./webhooks.definition";
import { BlockedWebhookAddressError } from "./webhooks.ssrf";
import type { WebhookRequest } from "./webhooks.transport";
import { signWebhookPayload } from "./webhooks.util";

export interface WebhookDeliveryDeps {
  db: Database;
  /** Sends one attempt and resolves with the response status; see postWebhook. */
  send: (request: WebhookRequest) => Promise<number>;
  now?: () => Date;
}

function classifyFailure(error: unknown): WebhookDeliveryError {
  if (error instanceof BlockedWebhookAddressError) {
    return "blocked_address";
  }

  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
    ? "timeout"
    : "network";
}

/**
 * The `webhook.deliver` job handler: one attempt of one event to one Webhook
 * Endpoint. Every attempt writes a delivery log row; a non-2xx response or no
 * response throws, so the job runner retries with backoff. An endpoint that
 * was deleted or no longer subscribes to the event gets nothing.
 */
export function createWebhookDeliveryHandler({
  db,
  send,
  now = () => new Date()
}: WebhookDeliveryDeps): (delivery: WebhookDelivery) => Promise<void> {
  return async (delivery) => {
    const [endpoint] = await db
      .select({
        eventTypes: webhookEndpointsTable.eventTypes,
        secret: webhookEndpointsTable.secret,
        url: webhookEndpointsTable.url
      })
      .from(webhookEndpointsTable)
      .where(
        and(
          eq(webhookEndpointsTable.id, delivery.endpointId),
          eq(webhookEndpointsTable.organizationId, delivery.organizationId)
        )
      )
      .limit(1);

    if (!endpoint?.eventTypes.includes(delivery.eventType)) {
      return;
    }

    const [previous] = await db
      .select({ attempts: count() })
      .from(webhookDeliveriesTable)
      .where(
        and(
          eq(webhookDeliveriesTable.eventId, delivery.eventId),
          eq(webhookDeliveriesTable.endpointId, delivery.endpointId)
        )
      );
    const attempt = (previous?.attempts ?? 0) + 1;
    const body = JSON.stringify({
      id: delivery.eventId,
      type: delivery.eventType,
      createdAt: delivery.occurredAt,
      data: delivery.data
    });
    const timestamp = Math.floor(now().getTime() / 1000);
    const { headers } = WEBHOOK_CONFIG;
    const startedAt = performance.now();
    let statusCode: number | null = null;
    let error: WebhookDeliveryError | null = null;

    try {
      statusCode = await send({
        url: endpoint.url,
        body,
        headers: {
          [headers.eventId]: delivery.eventId,
          [headers.eventType]: delivery.eventType,
          [headers.timestamp]: String(timestamp),
          [headers.signature]: signWebhookPayload(endpoint.secret, timestamp, body)
        },
        timeoutMs: WEBHOOK_CONFIG.timeoutMs
      });
      if (statusCode < 200 || statusCode > 299) {
        error = "http_status";
      }
    } catch (sendError) {
      error = classifyFailure(sendError);
    }

    await db.insert(webhookDeliveriesTable).values({
      attempt,
      durationMs: Math.round(performance.now() - startedAt),
      endpointId: delivery.endpointId,
      error,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      organizationId: delivery.organizationId,
      statusCode
    });

    if (error) {
      throw new Error(`webhook delivery failed: ${error}`);
    }
  };
}
