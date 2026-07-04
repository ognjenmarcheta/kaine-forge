# ADR 0006: In-Memory Fixed-Window API Rate Limiting

- Status: Accepted
- Date: 2026-07-03

## Context

The auth endpoints (login, signup, password reset, invitations) and the GraphQL endpoint needed brute-force and abuse protection. The template deploys as a single API container by default and should not require extra infrastructure to be safe out of the box.

## Decision

Ship an in-memory fixed-window rate limiter inside the API process (`apps/api/src/middleware/rate-limit.middleware.ts`):

- Applied to `/api/auth/*` and `/graphql`; never to `/health` or `/ready` (probes must not be throttled). `OPTIONS` preflights are exempt.
- Keyed by `socket.remoteAddress` by default. `API_TRUST_PROXY=true` switches to the rightmost `x-forwarded-for` entry — the one appended by the operator's own proxy — because the leftmost entry is attacker-controlled.
- Fixed window with env-configurable limits (`API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS`; defaults 100/60s), disabled under `NODE_ENV=test`.
- Bounded memory: time-gated stale-bucket sweep plus a hard bucket cap that fails open for new keys (an attacker who fills the table cannot lock out legitimate users).
- 429 responses carry `retry-after` and CORS headers so browsers can read them.
- The `check()` contract is the extension seam for a shared store.

## Alternatives Considered

- Redis-backed limiter: correct for multi-instance deployments but adds required infrastructure to the template's default single-container story; deliberately left as the documented extension point.
- Reverse-proxy rate limiting (nginx `limit_req`): not portable across the template's deployment targets and invisible to application logic/tests.

## Consequences

- Pros:
  - abuse protection with zero added infrastructure, fully unit-testable
  - trust-aware keying is safe in both direct-exposure and behind-proxy deployments
- Cons:
  - limits are per-instance; horizontal scaling multiplies the effective allowance until a shared store is plugged in
  - WebSocket upgrades bypass the HTTP handler and are not limited (documented boundary; connects still require a valid session)
