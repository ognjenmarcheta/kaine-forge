import type { EmailSender } from "@repo/email";

import type { JobHandlers } from "./jobs.definition";
import { createEmailJobHandler, EMAIL_JOB } from "./jobs.email";

/** Every job the application runs, keyed by job name (queue name in pg-boss). */
export const JOB_DEFINITIONS = {
  "email.send": EMAIL_JOB
};

export type AppJobs = typeof JOB_DEFINITIONS;

export function createJobHandlers(deps: { emailSender: EmailSender }): JobHandlers<AppJobs> {
  return {
    "email.send": createEmailJobHandler(deps.emailSender)
  };
}
