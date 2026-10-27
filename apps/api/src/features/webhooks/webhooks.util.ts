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
