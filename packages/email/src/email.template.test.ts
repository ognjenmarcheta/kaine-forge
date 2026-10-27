import { translationInstance } from "@repo/translation";
import { describe, expect, it } from "vitest";

import { renderEmail, type EmailTemplate } from "./email.template";

interface TemplateCase {
  email: EmailTemplate;
  locale: string;
  subject: string;
  phrase: string;
  // A link or code that both the HTML and the plain-text part must carry.
  token: string;
}

const RESET_URL = "https://api.example.com/api/auth/reset-password/tok-1?callbackURL=%2F";
const VERIFY_URL = "https://api.example.com/api/auth/verify-email?token=vtok-1";
const INVITE_URL = "https://app.example.com/invitations/inv-1";
const SECURITY_URL = "https://app.example.com/security";
const DELETE_URL = "https://app.example.com/account/delete?token=dtok-1";
const MEMBERS_URL = "https://app.example.com/members";

const cases: TemplateCase[] = [
  {
    email: { template: "passwordReset", url: RESET_URL, expiresInMinutes: 60 },
    locale: "en",
    subject: "Reset your password",
    phrase: "The link expires in 60 minutes.",
    token: RESET_URL
  },
  {
    email: { template: "passwordReset", url: RESET_URL, expiresInMinutes: 60 },
    locale: "de",
    subject: "Setze dein Passwort zurück",
    phrase: "Der Link läuft in 60 Minuten ab.",
    token: RESET_URL
  },
  {
    email: { template: "emailVerification", url: VERIFY_URL, expiresInHours: 24 },
    locale: "en",
    subject: "Verify your email address",
    phrase: "The link expires in 24 hours.",
    token: VERIFY_URL
  },
  {
    email: { template: "emailVerification", url: VERIFY_URL, expiresInHours: 24 },
    locale: "sr",
    subject: "Potvrdite email adresu",
    phrase: "Link ističe za 24 sati.",
    token: VERIFY_URL
  },
  {
    email: {
      template: "invitation",
      url: INVITE_URL,
      organizationName: "Acme",
      inviterName: "Ada",
      role: "admin",
      expiresInDays: 7
    },
    locale: "en",
    subject: "You have been invited to Acme",
    phrase: "Ada invited you to join Acme as an admin.",
    token: INVITE_URL
  },
  {
    email: {
      template: "invitation",
      url: INVITE_URL,
      organizationName: "Acme",
      inviterName: "Ada",
      role: "member",
      expiresInDays: 7
    },
    locale: "de",
    subject: "Du wurdest zu Acme eingeladen",
    phrase: "Ada hat dich eingeladen, Acme als Mitglied beizutreten.",
    token: INVITE_URL
  },
  {
    email: {
      template: "invitation",
      url: INVITE_URL,
      organizationName: "Acme",
      inviterName: "Ada",
      role: "editor",
      expiresInDays: 7
    },
    locale: "en",
    subject: "You have been invited to Acme",
    phrase: "Ada invited you to join Acme as a member with the “editor” role.",
    token: INVITE_URL
  },
  {
    email: { template: "twoFactorCode", code: "731045" },
    locale: "en",
    subject: "Your sign-in verification code",
    phrase: "Enter this code to finish signing in.",
    token: "731045"
  },
  {
    email: { template: "twoFactorCode", code: "731045" },
    locale: "sr",
    subject: "Vaš verifikacioni kod za prijavu",
    phrase: "Unesite ovaj kod da završite prijavu.",
    token: "731045"
  },
  {
    email: { template: "emailOtp", code: "482913", type: "sign-in", expiresInMinutes: 5 },
    locale: "en",
    subject: "Your sign-in code",
    phrase: "It expires in 5 minutes.",
    token: "482913"
  },
  {
    email: {
      template: "emailOtp",
      code: "482913",
      type: "email-verification",
      expiresInMinutes: 5
    },
    locale: "en",
    subject: "Your email verification code",
    phrase: "It expires in 5 minutes.",
    token: "482913"
  },
  {
    email: { template: "emailOtp", code: "482913", type: "forget-password", expiresInMinutes: 5 },
    locale: "de",
    subject: "Dein Code zum Zurücksetzen des Passworts",
    phrase: "Er läuft in 5 Minuten ab.",
    token: "482913"
  },
  {
    email: { template: "emailOtp", code: "482913", type: "change-email", expiresInMinutes: 5 },
    locale: "sr",
    subject: "Vaš kod za promenu email adrese",
    phrase: "Ističe za 5 minuta.",
    token: "482913"
  },
  {
    email: { template: "welcome", url: "https://app.example.com" },
    locale: "en",
    subject: "Welcome to Kaine Forge",
    phrase: "Your account is ready.",
    token: "https://app.example.com"
  },
  {
    email: { template: "welcome", url: "https://app.example.com" },
    locale: "de",
    subject: "Willkommen bei Kaine Forge",
    phrase: "Dein Konto ist bereit.",
    token: "https://app.example.com"
  },
  {
    email: { template: "passwordChanged", securityUrl: SECURITY_URL },
    locale: "en",
    subject: "Your password was changed",
    phrase: "If you did not make this change, reset your password right away.",
    token: SECURITY_URL
  },
  {
    email: { template: "passwordChanged", securityUrl: SECURITY_URL },
    locale: "sr",
    subject: "Vaša lozinka je promenjena",
    phrase: "Ako niste napravili ovu promenu, odmah resetujte lozinku.",
    token: SECURITY_URL
  },
  {
    email: { template: "emailChanged", newEmail: "new@example.com", securityUrl: SECURITY_URL },
    locale: "en",
    subject: "Your email address was changed",
    phrase: "The email address for your account was changed to new@example.com.",
    token: SECURITY_URL
  },
  {
    email: { template: "emailChanged", newEmail: "new@example.com", securityUrl: SECURITY_URL },
    locale: "de",
    subject: "Deine E-Mail-Adresse wurde geändert",
    phrase: "Die E-Mail-Adresse deines Kontos wurde in new@example.com geändert.",
    token: SECURITY_URL
  },
  {
    email: { template: "twoFactorEnabled", securityUrl: SECURITY_URL },
    locale: "en",
    subject: "Two-factor authentication is on",
    phrase: "Two-factor authentication was turned on for your account.",
    token: SECURITY_URL
  },
  {
    email: { template: "twoFactorEnabled", securityUrl: SECURITY_URL },
    locale: "sr",
    subject: "Dvofaktorska autentifikacija je uključena",
    phrase: "Za vaš nalog je uključena dvofaktorska autentifikacija.",
    token: SECURITY_URL
  },
  {
    email: {
      template: "emailChangeApproval",
      newEmail: "new@example.com",
      url: VERIFY_URL,
      expiresInHours: 24
    },
    locale: "en",
    subject: "Approve your email address change",
    phrase: "change the email address of your account to new@example.com.",
    token: VERIFY_URL
  },
  {
    email: {
      template: "emailChangeApproval",
      newEmail: "new@example.com",
      url: VERIFY_URL,
      expiresInHours: 24
    },
    locale: "de",
    subject: "Bestätige die Änderung deiner E-Mail-Adresse",
    phrase: "Der Link läuft in 24 Stunden ab.",
    token: VERIFY_URL
  },
  {
    email: { template: "accountDeletion", url: DELETE_URL, expiresInHours: 24 },
    locale: "en",
    subject: "Confirm your account deletion",
    phrase: "This also deletes every organization where you are the only member.",
    token: DELETE_URL
  },
  {
    email: { template: "accountDeletion", url: DELETE_URL, expiresInHours: 24 },
    locale: "sr",
    subject: "Potvrdite brisanje naloga",
    phrase: "Link ističe za 24 sati.",
    token: DELETE_URL
  },
  {
    email: { template: "roleChanged", url: MEMBERS_URL, organizationName: "Acme", role: "admin" },
    locale: "en",
    subject: "Your role in Acme changed",
    phrase: "You are now an admin of Acme.",
    token: MEMBERS_URL
  },
  {
    email: { template: "roleChanged", url: MEMBERS_URL, organizationName: "Acme", role: "editor" },
    locale: "en",
    subject: "Your role in Acme changed",
    phrase: "You are now a member with the “editor” role of Acme.",
    token: MEMBERS_URL
  },
  {
    email: { template: "roleChanged", url: MEMBERS_URL, organizationName: "Acme", role: "owner" },
    locale: "de",
    subject: "Deine Rolle in Acme hat sich geändert",
    phrase: "Du bist jetzt Inhaber von Acme.",
    token: MEMBERS_URL
  }
];

describe("renderEmail", () => {
  it.each(cases)(
    "renders $email.template in $locale with subject, phrase, and link or code in both parts",
    async ({ email: template, locale, subject, phrase, token }) => {
      const email = await renderEmail(template, locale);

      expect(email.subject).toBe(subject);
      expect(email.html).toContain(`lang="${locale}"`);
      expect(email.html).toContain(phrase);
      expect(email.text).toContain(phrase);
      expect(email.html).toContain(token);
      expect(email.text).toContain(token);
    }
  );

  it("escapes user-supplied names in the HTML part", async () => {
    const email = await renderEmail(
      {
        template: "invitation",
        url: INVITE_URL,
        organizationName: "<script>alert(1)</script> & Co",
        inviterName: '<img src=x onerror="alert(2)">',
        role: "member",
        expiresInDays: 7
      },
      "en"
    );

    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co");
    // The subject is plain text: no HTML entities, no raw markup interpreted.
    expect(email.subject).toBe("You have been invited to <script>alert(1)</script> & Co");
  });

  it("renders the caller's locale without changing the shared i18next language", async () => {
    await translationInstance.changeLanguage("sr");

    const email = await renderEmail({ template: "twoFactorCode", code: "1" }, "de");

    expect(email.subject).toBe("Dein Bestätigungscode für die Anmeldung");
    expect(translationInstance.language).toBe("sr");
  });

  it.each([null, undefined, "fr"])("falls back to English for the locale %s", async (locale) => {
    const email = await renderEmail({ template: "twoFactorCode", code: "1" }, locale);

    expect(email.subject).toBe("Your sign-in verification code");
    expect(email.html).toContain('lang="en"');
  });
});
