import { createConsoleEmailSender } from "./email.console";
import { createResendEmailSender } from "./email.resend";
import type { EmailSender } from "./email.type";

export const EMAIL_PROVIDERS = {
  CONSOLE: "console",
  RESEND: "resend"
} as const;

export function createEmailSender(
  env: Record<string, string | undefined> = process.env
): EmailSender {
  const provider = env.EMAIL_PROVIDER ?? EMAIL_PROVIDERS.CONSOLE;

  if (provider === EMAIL_PROVIDERS.CONSOLE) {
    return createConsoleEmailSender();
  }

  if (provider === EMAIL_PROVIDERS.RESEND) {
    const apiKey = env.RESEND_API_KEY?.trim();
    const from = env.EMAIL_FROM?.trim() || "noreply@example.com";

    if (!apiKey) {
      throw new Error(
        "EMAIL_PROVIDER=resend requires RESEND_API_KEY; set it or use EMAIL_PROVIDER=console for local development"
      );
    }

    return createResendEmailSender({ apiKey, from });
  }

  throw new Error(
    `unknown EMAIL_PROVIDER "${provider}"; implement EmailSender for it and register the provider in createEmailSender`
  );
}
