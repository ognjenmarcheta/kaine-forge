---
"@repo/email": major
"@repo/jobs": minor
"@repo/auth": minor
"@repo/db": minor
"@repo/translation": minor
"@repo/web": minor
"@repo/config": patch
---

Transactional emails now have an HTML part and a plain-text part, rendered with React Email (`@react-email/render`) from typed templates in the recipient's language: password reset, email verification, invitation, two-factor code, the four email one-time codes, a new welcome email, and new security alerts for a password change (also after a reset), an email change (sent to the previous address), and two-factor turning on.

`@repo/email` breaking change: `EmailMessage` requires `html`. The Resend adapter sends `html` and `text`; the console adapter logs recipient, subject, and text only. `renderEmail(template, locale)` renders `{ subject, html, text }` with a fixed locale and falls back to `DEFAULT_LANGUAGE`; it never changes the shared i18next language. User-supplied names are escaped in the HTML part.

`@repo/jobs`: the `email.send` payload carries `html`. Every auth email still goes through this job with retries, and auth responses do not wait for rendering or enqueueing.

`@repo/db` migration `0015` adds a nullable `users.locale`. `@repo/auth` exposes it as a user field that accepts only `en`, `sr`, or `de`, and `AuthTransport.updateEmailLanguage` writes it. The web language switch stores the language for the signed-in user. An invitation uses the inviter's stored language.

`@repo/translation` adds the `email` namespace in `en`, `sr`, and `de`. `@repo/config` compiles `.tsx` in Node workspaces (`jsx: react-jsx`).
