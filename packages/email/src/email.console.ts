import { createLogger, type Logger } from "@repo/logger";

import type { EmailMessage, EmailSender } from "./email.type";

export function createConsoleEmailSender(logger?: Pick<Logger, "info">): EmailSender {
  const emailLogger = logger ?? createLogger({ name: "email" });

  return {
    async send(message: EmailMessage): Promise<void> {
      // The text part carries the same links and codes as the HTML part.
      emailLogger.info(
        { to: message.to, subject: message.subject, text: message.text },
        "email delivered via console adapter"
      );
    }
  };
}
