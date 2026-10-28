import { getServerAuthConfig } from "@repo/auth";
import { db } from "@repo/db/client";
import { createEmailSender, renderEmail, type EmailTemplate } from "@repo/email";
import { createJobHandlers } from "@repo/jobs";
import { jobQueue } from "@repo/jobs/client";
import type { Logger } from "@repo/logger";

import { billingProvider } from "./features/billing/billing.provider";
import { createSeatSync } from "./features/billing/billing.seats";
import { resolveDataExportArchiveTtlMs } from "./features/data-export/data-export.config";
import { createDataExportJobHandler } from "./features/data-export/data-export.job";
import { s3ObjectStore } from "./features/storage/attachment.store";
import { createWebhookDeliveryHandler } from "./features/webhooks/webhooks.delivery";
import { postWebhook } from "./features/webhooks/webhooks.transport";

/** Renders one #703 email template and queues it on the job runner. */
export async function queueEmail(
  to: string,
  email: EmailTemplate,
  locale: string | null
): Promise<void> {
  await jobQueue.enqueue("email.send", { to, ...(await renderEmail(email, locale)) });
}

/** The job handlers of this process: the API (JOBS_RUNNER_ENABLED) or the worker. */
export function createApiJobHandlers(logger: Pick<Logger, "error" | "warn">) {
  return createJobHandlers({
    emailSender: createEmailSender(),
    dataExport: createDataExportJobHandler({
      db,
      store: s3ObjectStore,
      archiveTtlMs: resolveDataExportArchiveTtlMs(process.env),
      webAppUrl: getServerAuthConfig().webAppUrl,
      sendEmail: queueEmail,
      logger
    }),
    deliverWebhook: createWebhookDeliveryHandler({ db, send: (request) => postWebhook(request) }),
    syncSeats: ({ organizationId }) =>
      createSeatSync({ db, provider: billingProvider, logger }).syncOrganization(organizationId)
  });
}
