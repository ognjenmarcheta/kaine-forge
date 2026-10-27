export const WEBHOOK_CONFIG = {
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  },
  /** Whole-attempt budget: DNS, connect, TLS, and the response head. */
  timeoutMs: 10_000,
  /** Random bytes in a signing secret, hex-encoded after the `whsec_` prefix. */
  secretBytes: 32,
  secretPrefix: "whsec_",
  urlMaxLength: 2048,
  /** Endpoints per Organization; each event fans out to all of them. */
  endpointsPerOrganizationMax: 20,
  headers: {
    eventId: "x-webhook-id",
    eventType: "x-webhook-event",
    timestamp: "x-webhook-timestamp",
    signature: "x-webhook-signature"
  }
} as const;

/** Why an attempt got no 2xx, as stored in the delivery log. */
export type WebhookDeliveryError = "blocked_address" | "timeout" | "network" | "http_status";
