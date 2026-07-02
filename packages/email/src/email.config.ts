import { createConsoleEmailSender } from "./email.console";
import type { EmailSender } from "./email.type";

export const EMAIL_PROVIDERS = {
  CONSOLE: "console"
} as const;

export function createEmailSender(
  env: Record<string, string | undefined> = process.env
): EmailSender {
  const provider = env.EMAIL_PROVIDER ?? EMAIL_PROVIDERS.CONSOLE;

  if (provider === EMAIL_PROVIDERS.CONSOLE) {
    return createConsoleEmailSender();
  }

  throw new Error(
    `unknown EMAIL_PROVIDER "${provider}"; implement EmailSender for it and register the provider in createEmailSender`
  );
}
