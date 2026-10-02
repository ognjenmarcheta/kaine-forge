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
- Template uploads use a default MIME allowlist (images/docs/spreadsheets; no SVG) and re-check object size/type on confirm when HEAD metadata is available.
- Use Drizzle parameterized queries instead of handwritten SQL interpolation.
- Keep cookies primary for browser auth and bearer-token fallback limited to session-token transport.
- Web SPA must not store a durable session bearer in `localStorage` (cookie credentials only); mobile/desktop may use SecureStore or equivalent bearer transport.
- Production `BETTER_AUTH_SECRET` must be ≥32 characters and not a known placeholder; hard-gate on `emailVerified` when soft verification (ADR 0007) is not enough.

## Production auth hardening

Template defaults prioritize local DX. Before production multi-tenant traffic:

1. Generate a long random `BETTER_AUTH_SECRET` (≥32 characters); never reuse `.env.example` placeholders.
2. Set `API_CORS_ORIGINS` to the exact browser origins you serve (required in production; dual-purpose CORS + better-auth `trustedOrigins`).
3. Replace `EMAIL_PROVIDER=console` with a real adapter in `@repo/email` so password-reset and verification emails leave the process (console logs can include tokens).
4. Soft email verification (`AUTH_REQUIRE_EMAIL_VERIFICATION`, ADR 0007) does not block login. To hard-gate, check `session.user.emailVerified` in app routing or API policy for the surfaces you care about.
5. Prefer private S3 buckets; never copy the local MinIO anonymous-download pattern to production.

Runtime variable behavior is documented in `MONOREPO_GUIDE.md` section 9 and `.env.example`.

## Automation

- Dependency audit and secret scanning: `.github/workflows/security.yml`.
  - On `main` push, weekly schedule, and manual dispatch, `pnpm audit --audit-level high` **fails the job** on high or critical advisories (it no longer warns and continues).
  - Use `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` for an explicitly accepted advisory exception. Document the reason, affected paths, remaining risk, and removal trigger in the PR.
- PR quality/security gate: `.github/workflows/ci-pr.yml`.
- AI tooling health/drift check: `pnpm ai:doctor`.

### Accepted temporary audit exception

`GHSA-86w9-cpqp-85rv` (CVE-2026-85393) is temporarily excluded from the audit. As of 2026-10-02, `node-forge` 1.4.0 is affected and no fixed release is available. The paths include `expo > @expo/cli > node-forge` and `expo > @expo/cli > @expo/code-signing-certificates > node-forge`, including auto-installed `@better-auth/expo` peers. Expo certificate tooling calls the affected RSA signature verification code.

The repository owner accepts this risk while a compatible fix is unavailable. This exception does not fix the vulnerability and is not a false positive. Other high and critical advisories still fail the audit. Remove the exception when a fixed release is compatible with the supported Expo SDK, or when the affected dependency is removed. [Issue #457](https://github.com/ognjenmarcheta/kaine-forge/issues/457) tracks that removal; the [upstream advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) records the affected and fixed versions.
