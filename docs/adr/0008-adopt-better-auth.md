# ADR 0008: Adopt better-auth as the Authentication Provider

- Status: Accepted
- Date: 2026-07-04

## Context

The template declared `better-auth` as a dependency but never used it at runtime. Instead, `@repo/auth` shipped a bespoke session implementation that deliberately mimicked better-auth's API surface (session tokens, cookie-first with bearer fallback, organization membership, invitations, password reset, soft email verification) over the same Drizzle schema and `/api/auth/*` route layout. ADR 0005 called this out explicitly ("the better-auth dependency is unused at runtime and slated for removal (issue #44)"), and PR #47's post-hardening truth pass honestly re-described the whole auth stack as a "custom session implementation."

That characterization was accurate for the code as it stood, but it left the template maintaining a hand-rolled auth surface with no path to OAuth, passkeys, or 2FA — all of which are table stakes for downstream products. Because the schema, cookie model, and route paths were already modeled on better-auth, adopting the library properly is a smaller change than it looks, and it stops us from reinventing (and re-hardening) a surface a maintained library already provides.

## Decision

Adopt `better-auth` 1.6.23 as the authentication provider for `@repo/auth`:

- better-auth serves all `/api/auth/*` via `toNodeHandler`, mounted in `apps/api/src/server.ts`. The instance (`packages/auth/src/auth.instance.ts`) uses the Drizzle adapter over the existing tables, with the `organization` and `bearer` plugins.
- **scrypt password hashing is preserved** as better-auth's custom `password.{hash,verify}` hooks (`packages/auth/src/auth.password.ts`). Every pre-migration hash — the PHC-style `scrypt$N$r$p$salt$hash` format and legacy unsalted sha256 — still verifies. ADR 0005 remains the authoritative record of the hash format; it is now expressed through better-auth's password hooks rather than a bespoke login function.
- **Soft email verification is preserved.** `AUTH_REQUIRE_EMAIL_VERIFICATION` still issues a verification email without gating login, and `emailVerified` is exposed on the session user. ADR 0007 remains valid.
- **Our own rate limiting and health endpoints are unchanged.** better-auth's built-in rate limiting is disabled (`rateLimit: { enabled: false }`); the API's in-memory limiter still guards `/api/auth/*` and `/graphql`. ADR 0006 is unaffected.
- OAuth is env-gated: the `github` and `google` social providers activate only when both the client id and secret for a provider are set.
- Email flows (password reset, verification, invitation) route through `@repo/email` via better-auth hooks. Database hooks create the personal organization after user creation and set `activeOrganizationId` before session creation; organization hooks inject the org owner.
- `ServerAuth` becomes a thin session/read facade over `auth.api.getSession` plus Drizzle organization reads.

This decision **supersedes the "custom session implementation" characterization** from the PR #47 truth pass. ADR 0005 (scrypt hashing), ADR 0006 (in-memory rate limiting), and ADR 0007 (soft email verification) all remain accurate — hashing, rate limiting, and soft verification are still true, now expressed through better-auth configuration rather than bespoke code.

## Alternatives Considered

- Keep the custom session implementation: rejected. It reinvents a maintained library and offers no path to OAuth, passkeys, or 2FA without building each mechanism (and its hardening) by hand.
- Other auth libraries (Auth.js/NextAuth, Lucia): rejected. better-auth's first-class `organization` plugin and Drizzle adapter fit the template's organization-scoped, Drizzle/Postgres model directly; the alternatives fit the org-membership and schema shape worse and would force more glue.

## Consequences

- Pros:
  - social login (GitHub, Google) ships env-gated, plus a plugin ecosystem (passkeys, 2FA) available downstream without new bespoke code
  - a maintained library owns the routes, cookie handling, and token signing instead of the template
- Cons:
  - better-auth owns the routes and cookie (`kaine.session_token` via `cookiePrefix: "kaine"`); route and cookie naming are now the library's contract, not ours
  - `API_CORS_ORIGINS` is now dual-purpose: it also feeds better-auth's `trustedOrigins`. A browser-facing web origin missing from it produces a `403 INVALID_ORIGIN` on sign-in/sign-up (reads like an auth failure, not a CORS error). Every web origin must be listed. This is a deployment contract, documented in `MONOREPO_GUIDE.md` section 9 and `.env.example`.
  - migration ordering is load-bearing: `0003` backfills `password_hash` into credential `accounts.password` rows before `0005` drops the `users.password_hash` column. Forks with existing data must apply `0003` before `0005` or lose credentials.
  - mobile social login uses `@better-auth/expo` (server `expo()` plugin + client `expoClient`) with the `kaineforge://` deep-link scheme; UI buttons remain env-gated via `EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS`.
