---
"@repo/auth": minor
"@repo/db": minor
"@repo/api": minor
"@repo/web": minor
"@repo/translation": minor
"@repo/email": minor
---

Web users sign in with passkeys and with magic links (#712).

`@repo/auth` enables the official `@better-auth/passkey` add-on (pinned at `1.7.12` in the catalog, next to `better-auth`) and better-auth's `magicLink` plugin. The passkey relying party id is the host of `WEB_APP_URL` and the expected origin is its origin. Only an account with a verified email address can add a passkey, and an email-code or magic-link sign-in that verifies an account deletes the passkeys added before, so a squatter on an unverified address keeps no way back in. A passkey name has at most 64 characters, and adding a passkey emails a security alert. A magic link is for an existing account only (`disableSignUp`), stores its token hashed, expires in 10 minutes, and works once; `/sign-in/magic-link` is captcha-protected. The server emails the link only when an account exists, after the response, so the answer and its timing are the same for every address. Neither sign-in is challenged by two-factor, matching the email-code rule (ADR 0015). Adding and removing a passkey record the `passkey_added` and `passkey_removed` Audit Events, and the GraphQL `AuditAction` enum gains both.

`advanced.database.generateId` is now better-auth's `"uuid"` strategy, so the database generates row ids. The previous custom function made better-auth encode the cleanup lock of an email-code or magic-link sign-in into an unverified account as base64url, which the uuid column rejected, so that sign-in failed. That sign-in now works and runs better-auth's cleanup: it removes the account's password and older sessions. When it removes a password, the address gets a translated `passwordRemoved` email that says so and points to "Forgot password?".

The auth transport adds `sendMagicLink`, `signInWithPasskey`, `addPasskey`, `listPasskeys`, and `deletePasskey`, and registers the magic-link and passkey client plugins. `@repo/email` adds the `magicLink`, `passkeyAdded`, and `passwordRemoved` templates.

Migration `0023` adds the `passkeys` table.

The web Security page lists, adds (verified accounts only), and deletes the user's passkeys, with a confirmation step before a delete. The sign-in page offers "Sign in with a passkey" and "Email me a sign-in link"; a used or expired link returns to it with a clear error. The desktop app hides passkeys: it serves the web build from its Tauri origin, which never matches the relying party.
