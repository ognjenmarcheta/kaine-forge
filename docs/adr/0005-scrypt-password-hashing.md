# ADR 0005: Salted scrypt Password Hashing with Embedded Cost Parameters

- Status: Accepted
- Date: 2026-07-03
- Status update (2026-10-19, issue #492): the default cost is now N=16384, r=8, p=5, the 16 MiB variant of the OWASP Password Storage Cheat Sheet minimum. It equals N=2^17, r=8, p=1 in strength but keeps memory per concurrent login at 16 MiB instead of 128 MiB. Hashes at the old cost (p=1) still verify and are rehashed on the next login. The default is no longer below the OWASP minimum.
- Status update (2026-10-21, issue #499): the legacy unsalted SHA-256 verify path is removed. `verifyPassword` now returns false for any stored hash that is not `scrypt$N$r$p$salt$hash`, so a remaining SHA-256 hash fails login and its user must reset the password. `needsPasswordRehash` still flags such hashes. This supersedes the Decision bullet that says legacy SHA-256 hashes continue to verify.

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
