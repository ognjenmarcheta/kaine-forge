# ADR 0007: Soft Email Verification

- Status: Accepted
- Date: 2026-07-03

## Context

The template gained email verification (`users.email_verified`, verification tokens, `/api/auth/verify-email`, resend endpoint). The open question was whether unverified users should be blocked from logging in (hard gating) or whether verification should be informational until a downstream product decides otherwise.

## Decision

Verification is soft and opt-in:

- `AUTH_REQUIRE_EMAIL_VERIFICATION=true` makes signup issue a verification-token email, but the session is still created immediately.
- `emailVerified` is exposed on the session user (re-resolved per request, so verifying is visible on the next session read); downstream apps gate whatever they choose on it.
- Tokens are stored as sha256 digests, expire in 24 hours, are single-use via an atomic transactional claim, and can be re-issued through the authenticated resend endpoint (latest email wins).
- Email delivery failures never fail signup and never leak provider details.

## Alternatives Considered

- Hard gating (reject login until verified): forces every downstream product into a lockout + resend UX before it has decided it needs one, and complicates the template's e2e/demo flows.
- No verification at all: leaves downstream projects to retrofit token plumbing that is easy to get wrong (storage-at-rest, single-use semantics, enumeration).

## Consequences

- Pros:
  - the mechanism ships hardened while product policy stays with the adopter
  - flipping to hard gating downstream is a small, local change (check `emailVerified` at login or in app routing)
- Cons:
  - out of the box, nothing is actually gated — teams must remember the flag exists (documented in README `## Environment` and `CONTEXT.md`)
