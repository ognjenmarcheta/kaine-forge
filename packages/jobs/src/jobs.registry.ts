import type { EmailSender } from "@repo/email";

import { DATA_EXPORT_JOB, type DataExportJobPayload } from "./jobs.data-export";
import type { JobHandlers } from "./jobs.definition";
import { createEmailJobHandler, EMAIL_JOB } from "./jobs.email";

/** Every job the application runs, keyed by job name (queue name in pg-boss). */
export const JOB_DEFINITIONS = {
  "email.send": EMAIL_JOB,
  "data.export": DATA_EXPORT_JOB
};

export type AppJobs = typeof JOB_DEFINITIONS;

export function createJobHandlers(deps: {
  emailSender: EmailSender;
  /** Builds one data export's archive; the API owns its data access and storage. */
  dataExport: (payload: DataExportJobPayload) => Promise<void>;
}): JobHandlers<AppJobs> {
  return {
    "email.send": createEmailJobHandler(deps.emailSender),
    "data.export": deps.dataExport
  };
}
