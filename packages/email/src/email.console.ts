import { createLogger, type Logger } from "@repo/logger";

import type { EmailMessage, EmailSender } from "./email.type";

export function createConsoleEmailSender(logger?: Logger): EmailSender {
  const emailLogger = logger ?? createLogger({ name: "email" });

  return {
    async send(message: EmailMessage): Promise<void> {
      emailLogger.info(
        { to: message.to, subject: message.subject, text: message.text },
        "email delivered via console adapter"
      );
    }
  };
}
