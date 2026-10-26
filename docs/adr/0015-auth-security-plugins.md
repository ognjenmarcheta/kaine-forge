# ADR 0015: Auth Security Plugins and Session Cookie Cache

- Status: Accepted
- Date: 2026-10-26

## Context

Sign-in was email and password (plus optional GitHub/Google) with no second factor, no one-time codes, no bot check, and no check for breached passwords. Every GraphQL request also read the session from the database. better-auth 1.7 ships plugins for each gap (`twoFactor`, `emailOTP`, `captcha`, `haveIBeenPwned`) and a signed session cookie cache. Several of them have defaults that a reviewer would otherwise question again.

## Decision

`packages/auth/src/auth.instance.ts` enables:

- **Two-factor (`twoFactor`)**: TOTP, email code, and backup codes. It challenges **password sign-in only**. Email-code and social sign-in are not challenged (better-auth default). Accounts lock for 15 minutes after 10 failed codes. Web has the challenge step and a Security page (`apps/web/src/features/security`); mobile shows a message and sends the user to the web app.
- **Email OTP (`emailOTP`)**: sign-in and password reset with a 6-digit code (5 minutes, 3 attempts, stored hashed). `disableSignUp: true` keeps account creation on the sign-up form, which collects a name and is captcha-protected. Email verification stays link-based (ADR 0007 unchanged). Codes are sent without awaiting delivery so response timing does not reveal whether an account exists.
- **Captcha (`captcha`, Cloudflare Turnstile)**: active only when `TURNSTILE_SECRET_KEY` is set (`resolveCaptchaOptions`). It protects sign-up, password sign-in, both password-reset requests, and email-code requests. Web renders the Turnstile widget; mobile renders it in a WebView (`react-native-webview`). When the API enforces captcha, a client without a site key cannot sign in.
- **Have I Been Pwned (`haveIBeenPwned`)**: rejects breached passwords on sign-up, change, and both reset flows. It wraps our scrypt hash hook, so custom hashing (ADR 0005) is unaffected. It **fails closed** when `api.pwnedpasswords.com` is unreachable; `AUTH_PASSWORD_BREACH_CHECK=false` turns it off for offline development and e2e.
- **Session cookie cache**: `session.cookieCache` with a 5-minute window, plus indexes from the better-auth performance guide (migration `0010`). The instance imports `better-auth/minimal`, since the drizzle adapter and drizzle-kit own database access and migrations.

## Alternatives Considered

- Challenge email-code and social sign-in with 2FA too: needs custom hooks around better-auth's sign-in endpoints and a second-factor UX inside OAuth redirects. Deferred until a product needs it.
- Allow email-code sign-up: creates nameless users and a second, unprotected account-creation path.
- Captcha always on with Cloudflare test keys in development: adds a third-party round trip to every local and CI sign-in.
- No cookie cache: correct immediately on revocation, but one database read per request for every cookie client.

## Consequences

- Pros:
  - every gap is closed with maintained library code and env switches, not custom crypto
  - cookie clients skip the session read for 5 minutes; membership is still proven per GraphQL request
- Cons:
  - a revoked session stays valid on cookie clients for up to 5 minutes (bearer clients always hit the database)
  - an email-code sign-in for an account whose email was never verified removes its password and revokes its sessions (better-auth's protection against pre-registered accounts); with soft verification this affects most accounts
  - sign-up and password changes depend on HIBP availability unless the check is off
  - mobile cannot finish a two-factor sign-in yet
