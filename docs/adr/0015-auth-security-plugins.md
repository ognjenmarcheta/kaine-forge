# ADR 0015: Auth Security Plugins and Session Cookie Cache

- Status: Accepted
- Date: 2026-10-26

## Context

Sign-in was email and password (plus optional GitHub/Google) with no second factor, no one-time codes, no bot check, and no check for breached passwords. Every GraphQL request also read the session from the database. better-auth 1.7 ships plugins for each gap (`twoFactor`, `emailOTP`, `captcha`, `haveIBeenPwned`) and a signed session cookie cache. Several of them have defaults that a reviewer would otherwise question again.

## Decision

`packages/auth/src/auth.instance.ts` enables:

- **Two-factor (`twoFactor`)**: TOTP, email code, and backup codes. It challenges **password sign-in only**. Email-code, magic-link, passkey, and social sign-in are not challenged (better-auth default). Accounts lock for 15 minutes after 10 failed codes. Web has the challenge step and a Security page (`apps/web/src/features/security`); mobile shows a message and sends the user to the web app.
- **Email OTP (`emailOTP`)**: sign-in and password reset with a 6-digit code (5 minutes, 3 attempts, stored hashed). `disableSignUp: true` keeps account creation on the sign-up form, which collects a name and is captcha-protected. Email verification stays link-based (ADR 0007 unchanged). Codes are sent without awaiting delivery so response timing does not reveal whether an account exists.
- **Magic link (`magicLink`, issue #712)**: sign-in with a one-time link for an existing account. `disableSignUp: true` for the same reason as email codes. The token is stored hashed (`storeToken: "hashed"`), expires in 10 minutes, and is consumed on first use; a used or expired link redirects to the web sign-in page with an error and creates no Session. better-auth stores a token for any address, so the server sends the email only when an account exists; the lookup and the send run after the response, so the answer and its timing are the same for every address. The link opens the API, which sets the session cookie and redirects to the web app, like a social sign-in. It is not challenged by two-factor: like the email code, it already proves control of the address.
- **Passkeys (`@better-auth/passkey`, issue #712)**: WebAuthn registration, sign-in, list, and delete. The relying party id is the host of `WEB_APP_URL`, the expected origin is its origin, and the name is `appName`. Registration needs a fresh session (better-auth) and a verified email address (ours): under soft verification anyone can sign up with an address they do not own, and a passkey would let that squatter back in after the owner proves the address. For the same reason, when an email-code or magic-link sign-in promotes an unverified account, its passkeys are deleted with its password and sessions. A passkey name has at most 64 characters. List and delete act on the session user's passkeys only. A passkey sign-in creates a Session whose Active Organization is resolved like a password sign-in (`session.create.before`). It is not challenged by two-factor: the ceremony proves possession of a device-bound key, usually with the device's screen lock. Adding and removing a passkey record Audit Events (`passkey_added`, `passkey_removed`), and adding one emails a security alert (`passkeyAdded`). The web CSP needs no change: the browser runs the ceremony and the requests go to `CSP_API_ORIGINS`, and the `Permissions-Policy` does not deny `publickey-credentials-*`.
- **Captcha (`captcha`, Cloudflare Turnstile)**: active only when `TURNSTILE_SECRET_KEY` is set (`resolveCaptchaOptions`). It protects sign-up, password sign-in, both password-reset requests, email-code requests, and magic-link requests. Web renders the Turnstile widget; mobile renders it in a WebView (`react-native-webview`). When the API enforces captcha, a client without a site key cannot sign in.
- **Have I Been Pwned (`haveIBeenPwned`)**: rejects breached passwords on sign-up, change, and both reset flows. It wraps our scrypt hash hook, so custom hashing (ADR 0005) is unaffected. It **fails closed** when `api.pwnedpasswords.com` is unreachable; `AUTH_PASSWORD_BREACH_CHECK=false` turns it off for offline development and e2e.
- **Session cookie cache**: `session.cookieCache` with a 5-minute window, plus indexes from the better-auth performance guide (migration `0011`). The instance imports `better-auth/minimal`, since the drizzle adapter and drizzle-kit own database access and migrations.

## Alternatives Considered

- Challenge email-code, magic-link, passkey, and social sign-in with 2FA too: needs custom hooks around better-auth's sign-in endpoints and a second-factor UX inside OAuth and magic-link redirects. Deferred until a product needs it.
- Hand-rolled WebAuthn: rejected; the official `@better-auth/passkey` add-on (pinned in the catalog with `better-auth`) owns the ceremony and the challenge storage.
- Allow email-code sign-up: creates nameless users and a second, unprotected account-creation path.
- Captcha always on with Cloudflare test keys in development: adds a third-party round trip to every local and CI sign-in.
- No cookie cache: correct immediately on revocation, but one database read per request for every cookie client.

## Consequences

- Pros:
  - every gap is closed with maintained library code and env switches, not custom crypto
  - cookie clients skip the session read for 5 minutes; membership is still proven per GraphQL request
- Cons:
  - a revoked session stays valid on cookie clients for up to 5 minutes (bearer clients always hit the database)
  - an email-code or magic-link sign-in for an account whose email was never verified removes its password and revokes its sessions (better-auth's protection against pre-registered accounts); with soft verification this affects most accounts. This cleanup takes a lock row keyed by a deterministic id, so `advanced.database.generateId` is `"uuid"` (the database generates ids), not a custom function
  - the desktop app (Tauri) hides passkeys on every platform: it serves the web build from its own origin (`tauri://localhost` on macOS and Linux, `http://tauri.localhost` on Windows), which never matches the web relying party's origin, so a ceremony fails even where the webview exposes WebAuthn. Desktop passkeys need a relying party for that origin or a native bridge; that is a separate decision
  - sign-up and password changes depend on HIBP availability unless the check is off
  - mobile cannot finish a two-factor sign-in yet
