# ADR 0005: Salted scrypt Password Hashing with Embedded Cost Parameters

- Status: Accepted
- Date: 2026-07-03

## Context

The template originally stored passwords as unsalted SHA-256 digests, which is unsafe for any real deployment. The custom session auth in `@repo/auth` needed a password hashing scheme that ships secure defaults, requires no new native dependencies, and lets downstream projects raise the work factor later without breaking stored hashes.

## Decision

Use salted scrypt from `node:crypto` with PHC-style cost parameters embedded in each stored hash:

- Stored format: `scrypt$<N>$<r>$<p>$<salt-hex>$<hash-hex>` (defaults N=16384, r=8, p=1, 16-byte salt, 64-byte key).
- Verification reads N/r/p from the stored value (bounded to reject hostile parameters), so hashes created under older cost settings keep verifying after a cost bump.
- `needsPasswordRehash` flags legacy or old-cost hashes; `loginWithPassword` transparently rehashes them after successful verification (best-effort).
- Key derivation is asynchronous (libuv threadpool) so logins do not block the event loop; unknown-email logins run a dummy verification against a static hash to keep timing constant-shaped.
- Legacy unsalted SHA-256 hashes continue to verify (constant-time) until rehash-on-login upgrades them.
- The DB seed duplicates the recipe (`packages/db/src/seed/users.seed.ts`) because `@repo/auth` depends on `@repo/db` (import cycle); a test pins seed/auth format parity.

## Alternatives Considered

- bcrypt or argon2 packages: stronger ergonomics but add native dependencies to a template that aims for zero-friction `pnpm install` across platforms.
- better-auth built-in hashing: the better-auth dependency is unused at runtime and slated for removal (issue #44).
- Fixed-parameter scrypt without embedded costs: rejected because raising N later would silently break every stored hash.

## Consequences

- Pros:
  - no new dependencies; cost upgrades are safe and automatic via rehash-on-login
  - constant-time comparisons and bounded stored parameters resist timing and resource-exhaustion abuse
- Cons:
  - scrypt cost parameters live in two places (auth constants and the seed recipe); a pointer comment plus a parity test guard the drift
  - default N=16384 is below the OWASP ceiling; downstream projects with stricter requirements should raise it (the format makes this a constants change)
