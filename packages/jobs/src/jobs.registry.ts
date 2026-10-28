import type { EmailSender } from "@repo/email";

import { BILLING_SEATS_JOB, type BillingSeatsJobPayload } from "./jobs.billing";
import { DATA_EXPORT_JOB, type DataExportJobPayload } from "./jobs.data-export";
import type { JobHandlers } from "./jobs.definition";
import { createEmailJobHandler, EMAIL_JOB } from "./jobs.email";
import { WEBHOOK_JOB, type WebhookDelivery } from "./jobs.webhook";

/** Every job the application runs, keyed by job name (queue name in pg-boss). */
export const JOB_DEFINITIONS = {
  "email.send": EMAIL_JOB,
  "data.export": DATA_EXPORT_JOB,
  "webhook.deliver": WEBHOOK_JOB,
  "billing.syncSeats": BILLING_SEATS_JOB
};

export type AppJobs = typeof JOB_DEFINITIONS;

export function createJobHandlers(deps: {
  emailSender: EmailSender;
  /** Builds one data export's archive; the API owns its data access and storage. */
  dataExport: (payload: DataExportJobPayload) => Promise<void>;
  /** Sends one attempt; a rejection fails it, so the runner retries. */
  deliverWebhook: (delivery: WebhookDelivery) => Promise<void>;
  /** Syncs one Organization's seats; a rejection fails it, so the runner retries. */
  syncSeats: (payload: BillingSeatsJobPayload) => Promise<void>;
}): JobHandlers<AppJobs> {
  return {
    "email.send": createEmailJobHandler(deps.emailSender),
    "data.export": deps.dataExport,
    "webhook.deliver": deps.deliverWebhook,
    "billing.syncSeats": deps.syncSeats
  };
}
