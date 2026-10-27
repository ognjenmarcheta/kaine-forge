import type { EmailSender } from "@repo/email";

import type { JobHandlers } from "./jobs.definition";
import { createEmailJobHandler, EMAIL_JOB } from "./jobs.email";
import { WEBHOOK_JOB, type WebhookDelivery } from "./jobs.webhook";

/** Every job the application runs, keyed by job name (queue name in pg-boss). */
export const JOB_DEFINITIONS = {
  "email.send": EMAIL_JOB,
  "webhook.deliver": WEBHOOK_JOB
};

export type AppJobs = typeof JOB_DEFINITIONS;

export function createJobHandlers(deps: {
  emailSender: EmailSender;
  /** Sends one attempt; a rejection fails it, so the runner retries. */
  deliverWebhook: (delivery: WebhookDelivery) => Promise<void>;
}): JobHandlers<AppJobs> {
  return {
    "email.send": createEmailJobHandler(deps.emailSender),
    "webhook.deliver": deps.deliverWebhook
  };
}
