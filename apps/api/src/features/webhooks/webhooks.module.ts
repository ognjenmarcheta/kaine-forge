import type { recordAuditEvent } from "@repo/auth/audit";
import { webhookDeliveriesTable, webhookEndpointsTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { WEBHOOK_CONFIG } from "./webhooks.definition";
import { findWebhookUrlRefusal, type ResolveHost } from "./webhooks.ssrf";
import { auditableWebhookUrl, generateWebhookSecret } from "./webhooks.util";
import type { Connection, PageInput, ScopedData } from "../../context.data";
import { isWebhookEventType, WEBHOOK_EVENT_TYPES } from "../../pubsub";

export interface WebhookEndpointView {
  id: string;
  url: string;
  eventTypes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookDeliveryView = typeof webhookDeliveriesTable.$inferSelect;

export interface WebhookEndpointInput {
  url: string;
  eventTypes: readonly string[];
}

/** The Active Organization's Webhook Endpoints and their delivery logs. */
export interface WebhookEndpoints {
  /** Requires webhook:read. */
  eventTypes: () => readonly string[];
  /** Requires webhook:read. */
  list: (input: PageInput) => Promise<Connection<WebhookEndpointView>>;
  /** One endpoint's delivery attempts, newest first. Requires webhook:read. */
  deliveries: (endpointId: string, input: PageInput) => Promise<Connection<WebhookDeliveryView>>;
  /** Requires webhook:create; `secret` is returned here only. */
  create: (
    input: WebhookEndpointInput
  ) => Promise<{ endpoint: WebhookEndpointView; secret: string }>;
  /** Requires webhook:update; throws `webhook endpoint not found` outside the scope. */
  update: (id: string, input: WebhookEndpointInput) => Promise<WebhookEndpointView>;
  /**
   * Replaces the signing secret; the old one stops signing at once. Requires
   * webhook:update; the new secret is returned here only.
   */
  rotateSecret: (id: string) => Promise<string>;
  /** Requires webhook:delete. */
  delete: (id: string) => Promise<boolean>;
}

export interface WebhookEndpointsDeps {
  data: ScopedData;
  recordAuditEvent: typeof recordAuditEvent;
  resolveHost: ResolveHost;
}

function badInput(message: string, reason: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT", reason } });
}

const ENDPOINT_COLUMNS = {
  id: webhookEndpointsTable.id,
  url: webhookEndpointsTable.url,
  eventTypes: webhookEndpointsTable.eventTypes,
  createdAt: webhookEndpointsTable.createdAt,
  updatedAt: webhookEndpointsTable.updatedAt
};

export function createWebhookEndpoints({
  data,
  recordAuditEvent: record,
  resolveHost
}: WebhookEndpointsDeps): WebhookEndpoints {
  // Checks the URL (HTTPS, public addresses only) and the event types.
  async function parseInput(input: WebhookEndpointInput): Promise<WebhookEndpointInput> {
    const url = input.url.trim();

    if (url.length > WEBHOOK_CONFIG.urlMaxLength) {
      throw badInput("webhook url is too long", "invalid_url");
    }

    const refusal = await findWebhookUrlRefusal(url, resolveHost);

    if (refusal) {
      throw badInput(`webhook url refused: ${refusal}`, refusal);
    }

    const eventTypes = [...new Set(input.eventTypes)];

    if (eventTypes.length === 0 || !eventTypes.every(isWebhookEventType)) {
      throw badInput("webhook event types are invalid", "invalid_event_types");
    }

    return { url, eventTypes };
  }

  function actorOf(): { actorUserId: string; organizationId: string } {
    const { organizationId, userId } = data.stamp("userId");
    return { actorUserId: userId, organizationId };
  }

  return {
    eventTypes() {
      data.authorize("webhook:read");
      return WEBHOOK_EVENT_TYPES;
    },
    async list(input) {
      data.authorize("webhook:read");
      const page = await data.page(webhookEndpointsTable, input, {
        orderBy: webhookEndpointsTable.createdAt,
        direction: "desc",
        limits: WEBHOOK_CONFIG.pagination
      });
      return {
        items: page.items.map(({ id, url, eventTypes, createdAt, updatedAt }) => ({
          id,
          url,
          eventTypes,
          createdAt,
          updatedAt
        })),
        pageInfo: page.pageInfo
      };
    },
    deliveries(endpointId, input) {
      data.authorize("webhook:read");
      return data.page(
        webhookDeliveriesTable,
        input,
        {
          orderBy: webhookDeliveriesTable.createdAt,
          direction: "desc",
          limits: WEBHOOK_CONFIG.pagination
        },
        eq(webhookDeliveriesTable.endpointId, endpointId)
      );
    },
    async create(input) {
      data.authorize("webhook:create");
      const parsed = await parseInput(input);
      // At most endpointsPerOrganizationMax rows exist, so reading them is cheap.
      const existing = await data.selectFrom(webhookEndpointsTable);

      if (existing.length >= WEBHOOK_CONFIG.endpointsPerOrganizationMax) {
        throw badInput("webhook endpoint limit reached", "limit_reached");
      }

      const secret = generateWebhookSecret();
      const [endpoint] = await data
        .insert(webhookEndpointsTable)
        .values({
          ...data.stamp(),
          createdBy: data.stamp("userId").userId,
          eventTypes: [...parsed.eventTypes],
          secret,
          url: parsed.url
        })
        .returning(ENDPOINT_COLUMNS);

      if (!endpoint) {
        throw new Error("webhook endpoint was not created");
      }

      await record({
        ...actorOf(),
        action: "webhook_endpoint_created",
        metadata: {
          eventTypes: endpoint.eventTypes.join(","),
          url: auditableWebhookUrl(endpoint.url)
        },
        targetId: endpoint.id
      });

      return { endpoint, secret };
    },
    async update(id, input) {
      data.authorize("webhook:update");
      const parsed = await parseInput(input);
      const [endpoint] = await data
        .update(
          webhookEndpointsTable,
          { eventTypes: [...parsed.eventTypes], updatedAt: new Date(), url: parsed.url },
          eq(webhookEndpointsTable.id, id)
        )
        .returning(ENDPOINT_COLUMNS);

      if (!endpoint) {
        throw new Error("webhook endpoint not found");
      }

      await record({
        ...actorOf(),
        action: "webhook_endpoint_updated",
        metadata: {
          eventTypes: endpoint.eventTypes.join(","),
          url: auditableWebhookUrl(endpoint.url)
        },
        targetId: endpoint.id
      });

      return endpoint;
    },
    async rotateSecret(id) {
      data.authorize("webhook:update");
      const secret = generateWebhookSecret();
      const [endpoint] = await data
        .update(
          webhookEndpointsTable,
          { secret, updatedAt: new Date() },
          eq(webhookEndpointsTable.id, id)
        )
        .returning({ id: webhookEndpointsTable.id, url: webhookEndpointsTable.url });

      if (!endpoint) {
        throw new Error("webhook endpoint not found");
      }

      await record({
        ...actorOf(),
        action: "webhook_secret_rotated",
        metadata: { url: auditableWebhookUrl(endpoint.url) },
        targetId: endpoint.id
      });

      return secret;
    },
    async delete(id) {
      data.authorize("webhook:delete");
      const [endpoint] = await data
        .delete(webhookEndpointsTable, eq(webhookEndpointsTable.id, id))
        .returning({ id: webhookEndpointsTable.id, url: webhookEndpointsTable.url });

      if (!endpoint) {
        return false;
      }

      await record({
        ...actorOf(),
        action: "webhook_endpoint_deleted",
        metadata: { url: auditableWebhookUrl(endpoint.url) },
        targetId: endpoint.id
      });

      return true;
    }
  };
}
