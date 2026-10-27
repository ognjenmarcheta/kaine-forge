import {
  organizationsTable,
  usersTable,
  webhookDeliveriesTable,
  webhookEndpointsTable
} from "@repo/db/schema";
import { createTestDatabase } from "@repo/db/testing";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createWebhookDeliveryHandler } from "./webhooks.delivery";
import { BlockedWebhookAddressError } from "./webhooks.ssrf";
import type { WebhookRequest } from "./webhooks.transport";

const testDatabase = await createTestDatabase();
const db = testDatabase.db;
const SECRET = "whsec_fixed-test-secret";
const NOW = new Date("2023-11-14T22:13:20.000Z");

let organizationId: string;
let endpointId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(usersTable)
    .values({ email: "hooks@example.test", name: "Hooks" })
    .returning();
  const [organization] = await db
    .insert(organizationsTable)
    .values({ name: "Hooks", slug: "hooks", userId: user?.id })
    .returning();
  if (!organization) throw new Error("failed to seed organization");
  organizationId = organization.id;
  const [endpoint] = await db
    .insert(webhookEndpointsTable)
    .values({
      organizationId,
      url: "https://hooks.example.com/in",
      secret: SECRET,
      eventTypes: ["todo:created"]
    })
    .returning();
  if (!endpoint) throw new Error("failed to seed endpoint");
  endpointId = endpoint.id;
});

afterAll(async () => {
  await testDatabase.close();
});

function delivery(eventId: string, eventType = "todo:created") {
  return {
    data: { id: "todo-1", title: "Ship it", organizationId },
    endpointId,
    eventId,
    eventType,
    occurredAt: "2023-11-14T22:13:19.000Z",
    organizationId
  };
}

async function logOf(eventId: string) {
  return db
    .select({
      attempt: webhookDeliveriesTable.attempt,
      error: webhookDeliveriesTable.error,
      statusCode: webhookDeliveriesTable.statusCode
    })
    .from(webhookDeliveriesTable)
    .where(eq(webhookDeliveriesTable.eventId, eventId))
    .orderBy(asc(webhookDeliveriesTable.attempt));
}

describe("webhook delivery job", () => {
  it("POSTs the signed event once and logs the attempt", async () => {
    const send = vi.fn<(request: WebhookRequest) => Promise<number>>(() => Promise.resolve(204));
    const eventId = crypto.randomUUID();

    await createWebhookDeliveryHandler({ db, send, now: () => NOW })(delivery(eventId));

    const body = `{"id":"${eventId}","type":"todo:created","createdAt":"2023-11-14T22:13:19.000Z","data":{"id":"todo-1","title":"Ship it","organizationId":"${organizationId}"}}`;
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      url: "https://hooks.example.com/in",
      body,
      headers: {
        "x-webhook-id": eventId,
        "x-webhook-event": "todo:created",
        "x-webhook-timestamp": "1700000000"
      }
    });
    expect(await logOf(eventId)).toEqual([{ attempt: 1, error: null, statusCode: 204 }]);
  });

  it.each([
    ["a 500", () => Promise.resolve(500), 500, "http_status"],
    // The transport never follows a redirect: the 3xx is the attempt's result.
    ["a redirect, never followed", () => Promise.resolve(302), 302, "http_status"],
    [
      "a blocked address",
      () => Promise.reject(new BlockedWebhookAddressError()),
      null,
      "blocked_address"
    ],
    [
      "a timeout",
      () => Promise.reject(new DOMException("The operation was aborted", "AbortError")),
      null,
      "timeout"
    ]
  ])(
    "logs each failed attempt for %s and throws so the runner retries",
    async (_label, respond, statusCode, error) => {
      const send = vi.fn<(request: WebhookRequest) => Promise<number>>(respond);
      const eventId = crypto.randomUUID();
      const handler = createWebhookDeliveryHandler({ db, send, now: () => NOW });

      await expect(handler(delivery(eventId))).rejects.toThrow("webhook delivery failed");
      await expect(handler(delivery(eventId))).rejects.toThrow("webhook delivery failed");

      expect(send).toHaveBeenCalledTimes(2);
      expect(await logOf(eventId)).toEqual([
        { attempt: 1, error, statusCode },
        { attempt: 2, error, statusCode }
      ]);
    }
  );

  it("sends nothing for an event type the endpoint does not subscribe to", async () => {
    const send = vi.fn<(request: WebhookRequest) => Promise<number>>(() => Promise.resolve(200));
    const eventId = crypto.randomUUID();

    await createWebhookDeliveryHandler({ db, send })(delivery(eventId, "note:created"));

    expect(send).not.toHaveBeenCalled();
    expect(await logOf(eventId)).toEqual([]);
  });
});
