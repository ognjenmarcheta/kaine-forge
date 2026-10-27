import type { EmailMessage, EmailSender } from "@repo/email";
import { z } from "zod";

import { defineJob } from "./jobs.definition";

export const EMAIL_JOB = defineJob({
  payload: z.object({ to: z.string(), subject: z.string(), text: z.string() }),
  // Exponential from 10 s, capped at 10 min: about 15 min of provider outage
  // before the job fails.
  retry: { limit: 5, delaySeconds: 10, backoff: true, maxDelaySeconds: 600 },
  // Auth emails carry codes, links, and tokens. The row and its payload go
  // within a minute of the last attempt, plus one maintenance interval
  // (ADR 0018). A job still unrun after a day is deleted unsent.
  retention: { deleteAfterSeconds: 60, pendingSeconds: 60 * 60 * 24 }
});

export function createEmailJobHandler(
  sender: EmailSender
): (message: EmailMessage) => Promise<void> {
  // A rejected send fails the attempt, so the runner retries it.
  return (message) => sender.send(message);
}
