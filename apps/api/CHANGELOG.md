# @repo/api

## 1.2.0

### Minor Changes

- f884c6b: Add optional email verification on signup (AUTH_REQUIRE_EMAIL_VERIFICATION, soft mode): users.email_verified column + migration, hashed verification tokens with atomic claim, emailVerified exposed on the session user payload, and /api/auth/verify-email plus session-authenticated /api/auth/resend-email-verification
- 60cad98: Validate all API environment variables with Zod at startup; fail fast with a single error naming every missing or invalid variable
- 7fba80f: Add HTTP liveness (/health) and readiness (/ready, database connectivity) endpoints
- d03004e: Add organization invitation lifecycle: create/list/accept/revoke with role rules, expiry, and email notification. New REST routes under /api/auth/organization/invitation/\* and an invitations GraphQL query. Membership rows are now enforced unique per (organization, user) via a new unique index and migration, and invitation acceptance flips status and inserts the membership atomically. Note: the migration fails if duplicate (organization, user) member rows already exist — dedupe manually before migrating. Migration 0001 also backfills the `files` table and `file_status` enum, which previously existed only in schema source; databases provisioned via `db:push` from an earlier main already have them and must skip those statements when adopting `db:migrate`.
- c72eb56: Add password reset flow: request-reset (tokenized, no account enumeration) and reset (rehash + session invalidation) via /api/auth/request-password-reset and /api/auth/reset-password
- 5d8d4a1: Add in-memory fixed-window rate limiting for `/api/auth/*` and `/graphql` (`API_RATE_LIMIT_*` env vars; disabled in tests; Redis-ready check() contract). Also: constant-shape login timing for unknown emails, best-effort rehash-on-login, bounded /ready DB check, and Yoga's built-in health endpoint moved off /health.

### Patch Changes

- 881822c: Add HEALTHCHECK directives to Dockerfile.api (Node fetch against /health) and Dockerfile.web (wget against nginx)
- Updated dependencies [f884c6b]
- Updated dependencies [d03004e]
- Updated dependencies [c72eb56]
- Updated dependencies [5d8d4a1]
- Updated dependencies [3733f8d]
  - @repo/db@1.2.0
  - @repo/auth@1.3.0

## 1.1.11

### Patch Changes

- d5f6d92: Add AI todo generation with OpenAI and DeepSeek provider support.

## 1.1.10

### Patch Changes

- 89c319b: Add a LAN mobile dev workflow for physical device testing against a laptop-hosted API.

## 1.1.9

### Patch Changes

- 5d3ac31: Deepen API Todo mutation workflow orchestration while preserving GraphQL behavior.

## 1.1.8

### Patch Changes

- 845fa00: Move API storage runtime composition behind a dedicated Module while preserving storage lifecycle behavior.

## 1.1.7

### Patch Changes

- 69f4711: Deepen API auth transport, storage lifecycle, shared upload/auth transitions, explicit query runtime registration, and preference persistence modules.
- Updated dependencies [69f4711]
  - @repo/storage@1.1.2

## 1.1.6

### Patch Changes

- 1d159d2: Deepen Authenticated Organization Scope, Active Organization lifecycle, Todo workflow, Attachment lifecycle, Translation runtime, API runtime, and GraphQL feature composition seams.
- Updated dependencies [1d159d2]
  - @repo/auth@1.2.2
  - @repo/translation@1.1.1

## 1.1.5

### Patch Changes

- af949dd: Deepen shared auth, query, Todo, storage upload, persistence, and API scope architecture behind focused Modules and Adapters.
- Updated dependencies [af949dd]
  - @repo/auth@1.2.1
  - @repo/storage@1.1.1

## 1.1.4

### Patch Changes

- 7af7edb: Deepen organization-scoped auth, data access, client organization selection, and session transport.
- Updated dependencies [7b286b2]
- Updated dependencies [7af7edb]
  - @repo/auth@1.2.0
  - @repo/storage@1.1.0

## 1.1.3

### Patch Changes

- 29a0d96: Deepen Authenticated Organization Scope and move Organization membership reads into the auth package.
- Updated dependencies [29a0d96]
  - @repo/auth@1.1.2

## 1.1.2

### Patch Changes

- 17d103e: Deepen API organization-scoped access around an authenticated organization scope.

## 1.1.1

### Patch Changes

- efcb73a: Backport template-safe runtime hardening, Docker support, bearer auth fallback, organization members wiring, mobile UI primitives, and generated AI assistant scaffold.
- Updated dependencies [efcb73a]
  - @repo/auth@1.1.1
  - @repo/db@1.1.1

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

### Patch Changes

- Updated dependencies [42437fd]
  - @repo/feature-flags@1.1.0
  - @repo/translation@1.1.0
  - @repo/auth@1.1.0
  - @repo/db@1.1.0

## 1.0.0

### Major Changes

- 9633894: First release test

### Patch Changes

- Updated dependencies [9633894]
  - @repo/translation@1.0.0
  - @repo/auth@1.0.0
  - @repo/db@1.0.0
