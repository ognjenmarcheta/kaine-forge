import { createHmac, randomBytes } from "node:crypto";

import { WEBHOOK_CONFIG } from "./webhooks.definition";

/**
 * The signature header value of one delivery: `v1=` and the hex HMAC-SHA256,
 * keyed with the endpoint secret, of `<timestamp>.<raw body>`. A receiver
 * recomputes it over the exact bytes it got and the timestamp header.
 */
export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function generateWebhookSecret(): string {
  return `${WEBHOOK_CONFIG.secretPrefix}${randomBytes(WEBHOOK_CONFIG.secretBytes).toString("hex")}`;
}

/**
 * A Webhook Endpoint URL as an Audit Event records it: origin and path only.
 * The query string can carry a receiver's own token, so it is left out.
 */
export function auditableWebhookUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}
