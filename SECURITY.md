# Security Policy

## Reporting a Vulnerability

Do not open a public issue with exploit details.

Report privately to the maintainers with:

- affected workspace or component
- impact summary
- reproduction steps
- suggested remediation, if known

Use GitHub private vulnerability reporting: the repository's **Security** tab → **Report a vulnerability**. If that is unavailable, email `contact@byteforge.software` with `SECURITY` in the subject.

## Response Expectations

- Initial triage target: within 3 business days.
- Confirmation and severity assignment after reproduction.
- Fix timeline based on severity, exploitability, and blast radius.

## Supported Surfaces

- API auth/session handling.
- GraphQL input validation, depth limiting, and resolver authorization.
- Organization-scoped data access.
- CORS/preflight configuration.
- Client/server environment variable handling.
- S3-compatible storage integration.
- Docker runtime configuration.
- Dependency supply chain checks.

## Template Hardening Rules

- Never commit `.env` files, secrets, tokens, or local assistant state.
- Keep `.ai/mcp.json` generic and placeholder-only.
- Keep org-specific MCP servers, Jira, CodeRabbit, and private automation out of the template by default.
- Prefer least-privilege defaults for external integrations.
- Rotate secrets immediately if exposure is suspected.
- Validate inputs at API boundaries.
- Template uploads use a default MIME allowlist (images/docs/spreadsheets; no SVG) and reject a file name whose extension does not belong to its MIME type. The presigned PUT signs `Content-Type` and `Content-Length`, so the store rejects any other type or size. Confirm re-checks the object's size, type, and leading bytes, and deletes an object that does not match.
- Uploaded images are re-encoded without metadata (EXIF, GPS) and get a WebP thumbnail; processing rejects images above about 24 megapixels.
- Upload URLs expire after 600 s and download URLs after 300 s by default (`S3_UPLOAD_URL_EXPIRY`, `S3_DOWNLOAD_URL_EXPIRY`). Downloads of non-image Attachments carry `Content-Disposition: attachment`.
- Use Drizzle parameterized queries instead of handwritten SQL interpolation.
- `/graphql` requires the `x-graphql-yoga-csrf` header on GET requests and on form, multipart, and `text/plain` POSTs, which browsers send cross-site without a CORS preflight; without it the API answers 403. The template's GraphQL clients send `x-graphql-yoga-csrf: 1`. Session cookies stay `SameSite=Lax`; the header guard is defense in depth, for example against a same-site subdomain.
- Every API response carries `X-Content-Type-Options: nosniff`. The web image (`apps/web/nginx.conf`) sends `Content-Security-Policy`, `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`, no `preload`), `Permissions-Policy` (camera, microphone, geolocation, and payment denied), `X-Frame-Options`, and `Referrer-Policy` on every response. The CSP allows scripts only from the app and Cloudflare Turnstile, and network and image requests only to the app, `CSP_API_ORIGINS`, `CSP_STORAGE_ORIGINS`, and `CSP_PUBLIC_ASSET_ORIGINS` (see `docs/deploy.md`). `style-src` keeps `'unsafe-inline'` because sonner injects a `<style>` element at runtime.
- Keep cookies primary for browser auth and bearer-token fallback limited to session-token transport.
- Web SPA must not store a durable session bearer in `localStorage` (cookie credentials only); mobile/desktop may use SecureStore or equivalent bearer transport.
- Production `BETTER_AUTH_SECRET` must be ≥32 characters and not a known placeholder; hard-gate on `emailVerified` when soft verification (ADR 0007) is not enough.

## API Keys and Webhook Endpoints

- **Key hashing.** An API Key is created with the official `@better-auth/api-key` add-on. The API returns the plain key (prefix `kf_`) once, from `createApiKey`. The `api_keys` table stores only its SHA-256 hash and the first 7 characters for display; no log line contains the key. The add-on's HTTP routes are off: keys are created, listed, and revoked only through GraphQL with the Active Organization from the session, never with a client organization id.
- **Key scope.** A request with `x-api-key` on `/graphql` acts as an Authenticated Organization Scope for the key's Organization only, as the user who created the key. Its Permissions are the ones the key grants that the creator still holds there, so a key never carries more than its creator. A key never grants API Key management and has no Session, so it cannot reach user-level data. An unknown, revoked, or expired key, or one whose creator left the Organization, gets HTTP 401. Each key has its own bucket in the request rate limiter (429 with `retry-after`); an invalid key counts against the client address. API Keys work over HTTP only; GraphQL subscriptions still need a Session.
- **Signature scheme.** Every delivery is a JSON `POST` with the headers `x-webhook-id` (event id), `x-webhook-event`, `x-webhook-timestamp` (Unix seconds of the attempt), and `x-webhook-signature: v1=<hex>`. The signature is HMAC-SHA256, keyed with the endpoint's signing secret (shown once, at creation), over `<timestamp>.<raw body>`. Receivers must recompute it over the exact bytes they received, compare in constant time, and reject a timestamp more than a few minutes old. The same event id arrives again on a retry.
- **SSRF guard.** Endpoint create, update, and every delivery attempt resolve the host and refuse it when any resolved address is loopback, private (RFC 1918, carrier-grade NAT), link-local, unique-local, unspecified, multicast, reserved, or NAT64, for IPv4 and IPv6, including IPv4-mapped IPv6. A DNS answer that mixes public and blocked addresses is refused whole. The delivery connects to the addresses it checked (no second DNS lookup), so DNS rebinding cannot redirect it. Only HTTPS URLs without credentials are accepted, redirects are never followed, the response body is never read, and an attempt times out after 10 s.
- **Retries and log.** A non-2xx response, a timeout, or a blocked address fails the attempt; the job runner retries it with exponential backoff, up to 6 attempts. Each attempt is written to the delivery log with its status code, duration, and attempt number, never the response body.

## Production auth hardening

Template defaults prioritize local DX. Before production multi-tenant traffic:

1. Generate a long random `BETTER_AUTH_SECRET` (≥32 characters); never reuse `.env.example` placeholders.
2. Set `API_CORS_ORIGINS` to the exact browser origins you serve (required in production; dual-purpose CORS + better-auth `trustedOrigins`).
3. Replace `EMAIL_PROVIDER=console` with a real adapter in `@repo/email` so password-reset and verification emails leave the process (console logs can include tokens).
4. Soft email verification (`AUTH_REQUIRE_EMAIL_VERIFICATION`, ADR 0007) does not block login. To hard-gate, check `session.user.emailVerified` in app routing or API policy for the surfaces you care about.
5. Keep the Attachment bucket private. Every read goes through a presigned URL, and the local storage bucket is private too. Public Assets (`S3_PUBLIC_BUCKET`) use a separate bucket that holds only images the API re-encoded; never make the Attachment bucket or a prefix of it public.
6. Set `TURNSTILE_SECRET_KEY` with matching `VITE_TURNSTILE_SITE_KEY` / `EXPO_PUBLIC_TURNSTILE_SITE_KEY` to turn on captcha, and keep `AUTH_PASSWORD_BREACH_CHECK` on (ADR 0015).

Runtime variable behavior is documented in `MONOREPO_GUIDE.md` section 9 and `.env.example`.

## Automation

- Dependency audit and secret scanning: `.github/workflows/security.yml`.
  - On `main` push, weekly schedule, and manual dispatch, `pnpm audit --audit-level high` **fails the job** on high or critical advisories (it no longer warns and continues).
  - Use `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` for an explicitly accepted advisory exception. Document the reason, affected paths, remaining risk, and removal trigger in the PR.
- PR quality/security gate: `.github/workflows/ci-pr.yml`.
- Code scanning alerts (CodeQL and Trivy): the repository owner triages open alerts on `main` weekly. Each alert is fixed, dismissed as a false positive with a reason, or dismissed as accepted risk with an issue link.
- AI tooling health/drift check: `pnpm ai:doctor`.

### Accepted temporary audit exceptions

`GHSA-86w9-cpqp-85rv` (CVE-2026-85393) is temporarily excluded from the audit. As of 2026-10-02, `node-forge` 1.4.0 is affected and no fixed release is available. The paths include `expo > @expo/cli > node-forge` and `expo > @expo/cli > @expo/code-signing-certificates > node-forge`, including auto-installed `@better-auth/expo` peers. Expo certificate tooling calls the affected RSA signature verification code.

The repository owner accepts this risk while a compatible fix is unavailable. This exception does not fix the vulnerability and is not a false positive. Other high and critical advisories still fail the audit. Remove the exception when a fixed release is compatible with the supported Expo SDK, or when the affected dependency is removed. [Issue #457](https://github.com/ognjenmarcheta/kaine-forge/issues/457) tracks that removal; the [upstream advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) records the affected and fixed versions.

`GHSA-vfj7-8cjw-p6xm` is temporarily excluded from the audit. As of 2026-10-12, `braces` through 3.0.3 is affected and no fixed release is available. A deeply nested brace pattern can exhaust the call stack and stop the Node.js process. `braces` is in the production dependency graph: `@repo/auth > @better-auth/expo > expo` (auto-installed peers) `> @expo/cli > metro > metro-file-map > micromatch > braces`, so `braces` 3.0.3 ships in the API runtime image. Dev tooling (GraphQL Codegen, GraphQL Inspector, glob libraries) also resolves it. Only Metro, Expo CLI, and that tooling call `micromatch`, and they expand developer-authored patterns. The API does not run Metro or Expo CLI, and no API request path passes user input to `micromatch` or `braces`.

The repository owner accepts this risk while a fixed release is unavailable. Other high and critical advisories still fail the audit. Remove the exception when a fixed `braces` release passes the 3-day release-age gate, or when every dependent drops `braces`. [Issue #469](https://github.com/ognjenmarcheta/kaine-forge/issues/469) tracks that removal; the [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) records the affected versions.
