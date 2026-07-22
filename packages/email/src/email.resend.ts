import { createLogger, type Logger } from "@repo/logger";

import type { EmailMessage, EmailSender } from "./email.type";

export interface ResendEmailConfig {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
  logger?: Pick<Logger, "error" | "info">;
}

const RESEND_API_URL = "https://api.resend.com/emails";

export function createResendEmailSender(config: ResendEmailConfig): EmailSender {
  const emailLogger = config.logger ?? createLogger({ name: "email.resend" });
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async send(message: EmailMessage): Promise<void> {
      const response = await fetchImpl(RESEND_API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text
        })
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        emailLogger.error(
          { status: response.status, body: body.slice(0, 500) },
          "resend email delivery failed"
        );
        throw new Error(`resend email failed with status ${String(response.status)}`);
      }

      emailLogger.info({ to: message.to, subject: message.subject }, "email delivered via resend");
    }
  };
}
