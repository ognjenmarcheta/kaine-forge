import { render, toPlainText } from "@react-email/render";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  translationInstance,
  type SupportedLanguage
} from "@repo/translation";
import type { ReactNode } from "react";

import { EmailButton, EmailCode, EmailLayout, EmailText } from "./email.layout";
import type { EmailContent } from "./email.type";

export type EmailOtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

/**
 * Every transactional email and its typed inputs. Values that come from
 * users (names, Organization names, email addresses) are text, never markup:
 * React escapes them in the HTML part.
 */
export type EmailTemplate =
  | { template: "passwordReset"; url: string; expiresInMinutes: number }
  | { template: "emailVerification"; url: string; expiresInHours: number }
  | {
      template: "invitation";
      url: string;
      organizationName: string;
      inviterName: string;
      role: string;
      expiresInDays: number;
    }
  | { template: "twoFactorCode"; code: string }
  | { template: "emailOtp"; code: string; type: EmailOtpType; expiresInMinutes: number }
  | { template: "welcome"; name: string; url: string }
  | { template: "passwordChanged"; securityUrl: string }
  | { template: "emailChanged"; newEmail: string; securityUrl: string }
  | { template: "twoFactorEnabled"; securityUrl: string }
  | { template: "emailChangeApproval"; newEmail: string; url: string; expiresInHours: number }
  | { template: "accountDeletion"; url: string; expiresInHours: number };

const EMAIL_OTP_SUBJECT_KEYS: Record<EmailOtpType, string> = {
  "sign-in": "email.emailOtp.subject.signIn",
  "email-verification": "email.emailOtp.subject.emailVerification",
  "forget-password": "email.emailOtp.subject.forgetPassword",
  "change-email": "email.emailOtp.subject.changeEmail"
};

type Translate = (key: string, values?: Record<string, number | string>) => string;

interface TemplateParts {
  subject: string;
  heading: string;
  body: ReactNode;
}

function securityAlert(
  t: Translate,
  name: "passwordChanged" | "emailChanged" | "twoFactorEnabled",
  securityUrl: string,
  values?: Record<string, string>
): TemplateParts {
  return {
    subject: t(`email.${name}.subject`),
    heading: t(`email.${name}.heading`),
    body: (
      <>
        <EmailText>{t(`email.${name}.body`, values)}</EmailText>
        <EmailText>{t("email.securityAlert.notYou")}</EmailText>
        <EmailButton
          fallback={t("email.layout.linkFallback")}
          href={securityUrl}
          label={t("email.securityAlert.action")}
        />
      </>
    )
  };
}

function buildTemplate(email: EmailTemplate, t: Translate): TemplateParts {
  const fallback = t("email.layout.linkFallback");

  switch (email.template) {
    case "passwordReset":
      return {
        subject: t("email.passwordReset.subject"),
        heading: t("email.passwordReset.heading"),
        body: (
          <>
            <EmailText>
              {t("email.passwordReset.body", { minutes: email.expiresInMinutes })}
            </EmailText>
            <EmailButton
              fallback={fallback}
              href={email.url}
              label={t("email.passwordReset.action")}
            />
            <EmailText>{t("email.passwordReset.ignore")}</EmailText>
          </>
        )
      };
    case "emailVerification":
      return {
        subject: t("email.emailVerification.subject"),
        heading: t("email.emailVerification.heading"),
        body: (
          <>
            <EmailText>
              {t("email.emailVerification.body", { hours: email.expiresInHours })}
            </EmailText>
            <EmailButton
              fallback={fallback}
              href={email.url}
              label={t("email.emailVerification.action")}
            />
            <EmailText>{t("email.emailVerification.ignore")}</EmailText>
          </>
        )
      };
    case "invitation": {
      const organizationName = email.organizationName;

      return {
        subject: t("email.invitation.subject", { organizationName }),
        heading: t("email.invitation.heading", { organizationName }),
        body: (
          <>
            <EmailText>
              {t("email.invitation.body", {
                inviterName: email.inviterName,
                organizationName,
                // Invitations grant admin or member only; ownership moves by transfer.
                role: t(`email.invitation.role.${email.role === "admin" ? "admin" : "member"}`)
              })}
            </EmailText>
            <EmailButton
              fallback={fallback}
              href={email.url}
              label={t("email.invitation.action")}
            />
            <EmailText>{t("email.invitation.expiry", { days: email.expiresInDays })}</EmailText>
          </>
        )
      };
    }
    case "twoFactorCode":
      return {
        subject: t("email.twoFactorCode.subject"),
        heading: t("email.twoFactorCode.heading"),
        body: (
          <>
            <EmailText>{t("email.twoFactorCode.body")}</EmailText>
            <EmailCode code={email.code} />
            <EmailText>{t("email.twoFactorCode.ignore")}</EmailText>
          </>
        )
      };
    case "emailOtp":
      return {
        subject: t(EMAIL_OTP_SUBJECT_KEYS[email.type]),
        heading: t("email.emailOtp.heading"),
        body: (
          <>
            <EmailText>{t("email.emailOtp.body", { minutes: email.expiresInMinutes })}</EmailText>
            <EmailCode code={email.code} />
            <EmailText>{t("email.emailOtp.ignore")}</EmailText>
          </>
        )
      };
    case "welcome": {
      const appName = t("common.appName");

      return {
        subject: t("email.welcome.subject", { appName }),
        heading: t("email.welcome.heading", { name: email.name }),
        body: (
          <>
            <EmailText>{t("email.welcome.body")}</EmailText>
            <EmailButton
              fallback={fallback}
              href={email.url}
              label={t("email.welcome.action", { appName })}
            />
          </>
        )
      };
    }
    case "passwordChanged":
      return securityAlert(t, "passwordChanged", email.securityUrl);
    case "emailChanged":
      return securityAlert(t, "emailChanged", email.securityUrl, { newEmail: email.newEmail });
    case "twoFactorEnabled":
      return securityAlert(t, "twoFactorEnabled", email.securityUrl);
    // Goes to the current address before the new one gets a verification link.
    case "emailChangeApproval":
      return {
        subject: t("email.emailChangeApproval.subject"),
        heading: t("email.emailChangeApproval.heading"),
        body: (
          <>
            <EmailText>
              {t("email.emailChangeApproval.body", {
                newEmail: email.newEmail,
                hours: email.expiresInHours
              })}
            </EmailText>
            <EmailButton
              fallback={fallback}
              href={email.url}
              label={t("email.emailChangeApproval.action")}
            />
            <EmailText>{t("email.emailChangeApproval.ignore")}</EmailText>
          </>
        )
      };
    case "accountDeletion":
      return {
        subject: t("email.accountDeletion.subject"),
        heading: t("email.accountDeletion.heading"),
        body: (
          <>
            <EmailText>
              {t("email.accountDeletion.body", { hours: email.expiresInHours })}
            </EmailText>
            <EmailButton
              fallback={fallback}
              href={email.url}
              label={t("email.accountDeletion.action")}
            />
            <EmailText>{t("email.accountDeletion.ignore")}</EmailText>
          </>
        )
      };
  }
}

function resolveEmailLocale(locale: string | null | undefined): SupportedLanguage {
  return SUPPORTED_LANGUAGES.find((language) => language === locale) ?? DEFAULT_LANGUAGE;
}

/**
 * Renders one email in the given locale, or in DEFAULT_LANGUAGE when the
 * locale is missing or unsupported. It reads a fixed-language translator and
 * never changes the shared i18next language.
 */
export async function renderEmail(
  email: EmailTemplate,
  locale: string | null | undefined
): Promise<EmailContent> {
  const language = resolveEmailLocale(locale);
  const fixedT = translationInstance.getFixedT(language);
  // React escapes the HTML part and the subject is plain text, so i18next
  // must not escape interpolated values a second time.
  const t: Translate = (key, values) =>
    fixedT(key, { ...values, interpolation: { escapeValue: false } });
  const parts = buildTemplate(email, t);
  const html = await render(
    <EmailLayout
      footer={t("email.layout.footer", { appName: t("common.appName") })}
      heading={parts.heading}
      locale={language}
      subject={parts.subject}
    >
      {parts.body}
    </EmailLayout>
  );

  return {
    subject: parts.subject,
    html,
    // Headings keep their case: upper-casing reads badly in every locale.
    text: toPlainText(html, { selectors: [{ selector: "h1", options: { uppercase: false } }] })
  };
}
