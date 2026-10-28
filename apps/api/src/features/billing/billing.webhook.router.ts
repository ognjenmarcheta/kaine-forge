import { recordAuditEvent } from "@repo/auth/audit";
import { db } from "@repo/db";
import { createLogger } from "@repo/logger";

import { billingProvider } from "./billing.provider";
import { createBillingWebhookHandler } from "./billing.webhook";
import {
  createBillingWebhookTransport,
  type BillingWebhookRouteContext
} from "./billing.webhook.transport";

const logger = createLogger({ name: "billing" });

const billingWebhookTransport = createBillingWebhookTransport({
  handle: createBillingWebhookHandler({ db, provider: billingProvider, recordAuditEvent, logger }),
  logger
});

export function handleBillingWebhookRoute(ctx: BillingWebhookRouteContext): Promise<boolean> {
  return billingWebhookTransport.dispatch(ctx);
}
