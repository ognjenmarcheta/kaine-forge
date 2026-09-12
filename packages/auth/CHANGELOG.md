# @repo/auth

## 1.5.2

### Patch Changes

- ceef03e: Intentional dependency upgrades from issue #198: Dependabot freezes for mobile singleton packages, jsdom 30, web React 19.2 catalog, GraphQL Codegen v7 suite with client regenerate, and Expo SDK 55 mobile graph (RN 0.83, expo ~55).
- Updated dependencies [9f617ba]
  - @repo/db@1.6.2
  - @repo/email@1.2.0

## 1.5.1

### Patch Changes

- 5aa8a1d: Clear fixable Trivy CRITICAL findings in the API Docker image via workspace overrides (shell-quote, tar, esbuild), catalog bumps (vitest, drizzle-orm), and drop the unused base-image npm (nested tar) from the API runner stage.
- Updated dependencies [5aa8a1d]
  - @repo/db@1.6.1

## 1.5.0

### Minor Changes

- 8be5914: Enable mobile social login with @better-auth/expo deep-link OAuth (server expo plugin, client expoClient, env-gated buttons).
- 81919a2: Share auth form validation across web and mobile via `@repo/auth/form`, and document intentional mobile-ui subset in the design system.

### Patch Changes

- 22a7c4d: Close a batch of principal architecture review findings: honest package `dev` scripts, stronger catalog enforcement, fuller `create:package` wiring, Vitest UI/`test:watch`, digest-pinned Docker bases with a blocking Trivy CRITICAL gate, and CI/DX hardening (knip/boundaries on PRs, safer concurrency, caches, launch configs).
- 8d04ade: Enforce production BETTER_AUTH_SECRET minimum length and reject known placeholders at boot.
- 4c45e37: Emit flat package dist for Docker: build tsconfigs clear monorepo path mappings, pin rootDir, and exclude tests so main/exports match runtime layout.
- 7bdc15c: Add dead-code and dependency-graph enforcement, and finish declaring the graph.

  `pnpm knip` and `pnpm boundaries` are new and both run in `pnpm check`. `turbo boundaries` complements the existing ESLint rules rather than replacing them: it catches importing a package a workspace does not declare, which ESLint cannot see, while ESLint keeps enforcing the web/mobile UI split and the `@repo/*/src` deep-import ban. `boundaries` is experimental in Turbo 2.8, which is why it is additive.

  `turbo boundaries` found 153 undeclared imports: 145 test files importing `vitest`, and `packages/config/eslint/*.js` importing six ESLint plugins. All resolved only through pnpm root hoisting. Every workspace that imports `vitest` now declares it, and the six plugins moved from the root to `@repo/config`, which is where they are imported — the root `eslint.config.mjs` only re-exports. `pnpm --filter <workspace> test` no longer depends on hoisting. One exception remains, marked with `@boundaries-ignore`: `packages/config/mobile-lan-dev.test.ts` reaches into `tooling/dev-mobile-lan.ts`, a loose root script with no workspace of its own to be tested from.

  knip is configured against this repo's conventions rather than run on defaults, which reported 63 false "unused files". Test files are entry points; the vitest `react-native` alias target, Expo/Metro config, and template placeholder files are ignored; the `exports` and `types` rules are off because this repo deliberately exports internals for unit testing. The dependency rule keeps an explicit ignore list for things static analysis cannot see: `pino-pretty` (referenced as a transport string), `tailwindcss` (a Tailwind v4 peer of `@tailwindcss/vite`), the `catalog:mobile` React Native singleton pins, Expo plugin inferences, and `zod` in `@repo/auth`.

  That last one is worth recording: knip reported `zod` as unused in `@repo/auth` and nothing imports it, but removing it breaks the build with TS2742 — better-auth's inferred types reference zod, so it is required for declaration emit. The pre-existing catalog alignment test already guarded it. **Verify a dependency removal with a build, not a grep.**

  Removed genuinely dead code that knip surfaced, each verified unreferenced first: eight source files across api/web/mobile, plus `react-i18next` from `@repo/translation` (declared but imported nowhere in the repo). Deleted `vitest.workspace.ts` — it used `defineWorkspace`, deprecated in the installed Vitest 3.2.4 and removed in 4, was invoked by nothing, and had drifted from `vitest.coverage.config.ts`, which is now the single project list.

  Normalized the four tsconfigs that extended the root base directly instead of the shared presets in `packages/config/typescript/`.

  Five new alignment tests, each verified to fail when violated: every workspace declares `@repo/config`; `globalDependencies` never lists the lockfile or globs a package; neither Dockerfile hand-copies `packages/config`; vitest importers declare vitest; ESLint plugins live in `@repo/config` and not the root.

- 79fa89e: Complete TypeScript project references for tsc-emitting packages: composite `tsconfig.build.json` + `tsc -b`, while typecheck keeps source paths (issue #147).
- 21b3002: Make the Turbo dependency graph honest and stop the cache from invalidating itself.

  `@repo/config` was consumed by every workspace through relative `tsconfig` extends and the root ESLint/Prettier configs, but was declared as a dependency by nobody. Three workarounds had grown around that missing edge: a `packages/config/**` entry in `globalDependencies`, a hand-written `COPY --from=pruner /app/packages/config/` in both Dockerfiles because `turbo prune` correctly excluded it, and a hardcoded `SHARED_BUILD_WORKSPACE_DIRS` in `.ai/release.util.ts`. Every workspace now declares `@repo/config`, and all three workarounds are gone — `turbo prune` includes the presets on its own, and `release-apps` derives affected apps from the graph.

  Cache inputs are now scoped to what each task actually reads. Global hashed files drop from 27 to 2:
  - `pnpm-lock.yaml` left `globalDependencies` — Turborepo already hashes each package's resolved external dependencies, so listing the whole lockfile invalidated every task in every package on any dependency bump.
  - `eslint.config.mjs` and `.prettierrc*` moved from `globalDependencies` to per-task `inputs` on `lint` and `format:check` via `$TURBO_ROOT$`, so a lint-config edit no longer invalidates `build` and `test`.
  - Globbing `packages/config/**` had pulled gitignored `.turbo/*.log` files, `CHANGELOG.md`, and the package's own tests into the global hash. A new `packages/config/turbo.json` narrows its `build` inputs to the preset files.
  - `build` now excludes `CHANGELOG.md`, so `changeset version` no longer busts every build cache.
  - `CI` moved from `globalEnv` to `globalPassThroughEnv`. It is unset locally and `true` in Actions, so hashing it meant a CI cache entry could never be restored on a developer machine, or the reverse.

  Three alignment tests guard the fix: every workspace must declare `@repo/config`, `globalDependencies` must not glob a package or list the lockfile, and neither Dockerfile may hand-copy `packages/config`.

  `test` keeps its `^build` dependency. Wiping every `dist` and running tests without building fails `@repo/email#test`, because only `apps/api`, `apps/mobile`, `packages/auth`, and `packages/mobile-ui` alias `@repo/*` to source in their vitest config; the rest resolve siblings through package exports. That is now recorded in the task description.

- Updated dependencies [22a7c4d]
- Updated dependencies [44b7eaa]
- Updated dependencies [29028d4]
- Updated dependencies [4c45e37]
- Updated dependencies [7bdc15c]
- Updated dependencies [fdce5d8]
- Updated dependencies [79fa89e]
- Updated dependencies [21b3002]
  - @repo/db@1.6.0
  - @repo/email@1.2.0

## 1.4.2

### Patch Changes

- Updated dependencies [87e6d0b]
  - @repo/db@1.5.0

## 1.4.1

### Patch Changes

- Updated dependencies [f136b60]
  - @repo/db@1.4.0

## 1.4.0

### Minor Changes

- c046f32: Introduce the better-auth instance (drizzle adapter, custom scrypt hooks, organization + bearer plugins) and align the database schema; passwords migrate to credential accounts
- 68ebc61: Serve /api/auth/\* through better-auth's node handler; ServerAuth slims to the session/read facade; signup invariants move to better-auth database hooks. users.password_hash becomes nullable so better-auth-created users need no legacy hash.
- b2b0a3e: Route password reset, email verification, and invitation emails through @repo/email via better-auth hooks; remove the superseded custom auth flow modules
- 4057465: Env-gated GitHub and Google social login: each provider activates only when both its client id and secret are set
- c1d66c1: Clients authenticate through better-auth's client (organization + bearer flows) with env-gated GitHub/Google social login buttons

### Patch Changes

- 9cc4adf: Drop the superseded users.password_hash column (credential accounts are authoritative) and polish client member-list/slug-retry edges
- Updated dependencies [c046f32]
- Updated dependencies [68ebc61]
- Updated dependencies [9cc4adf]
  - @repo/db@1.3.0

## 1.3.0

### Minor Changes

- f884c6b: Add optional email verification on signup (AUTH_REQUIRE_EMAIL_VERIFICATION, soft mode): users.email_verified column + migration, hashed verification tokens with atomic claim, emailVerified exposed on the session user payload, and /api/auth/verify-email plus session-authenticated /api/auth/resend-email-verification
- d03004e: Add organization invitation lifecycle: create/list/accept/revoke with role rules, expiry, and email notification. New REST routes under /api/auth/organization/invitation/\* and an invitations GraphQL query. Membership rows are now enforced unique per (organization, user) via a new unique index and migration, and invitation acceptance flips status and inserts the membership atomically. Note: the migration fails if duplicate (organization, user) member rows already exist — dedupe manually before migrating. Migration 0001 also backfills the `files` table and `file_status` enum, which previously existed only in schema source; databases provisioned via `db:push` from an earlier main already have them and must skip those statements when adopting `db:migrate`.
- c72eb56: Add password reset flow: request-reset (tokenized, no account enumeration) and reset (rehash + session invalidation) via /api/auth/request-password-reset and /api/auth/reset-password
- 3733f8d: Replace unsalted SHA-256 password hashing with salted scrypt; legacy hashes still verify and are rehashed on login. Seed data uses the new format.

### Patch Changes

- 5d8d4a1: Add in-memory fixed-window rate limiting for `/api/auth/*` and `/graphql` (`API_RATE_LIMIT_*` env vars; disabled in tests; Redis-ready check() contract). Also: constant-shape login timing for unknown emails, best-effort rehash-on-login, bounded /ready DB check, and Yoga's built-in health endpoint moved off /health.
- Updated dependencies [a53d830]
- Updated dependencies [f884c6b]
- Updated dependencies [d03004e]
- Updated dependencies [3733f8d]
  - @repo/email@1.1.0
  - @repo/db@1.2.0

## 1.2.2

### Patch Changes

- 1d159d2: Deepen Authenticated Organization Scope, Active Organization lifecycle, Todo workflow, Attachment lifecycle, Translation runtime, API runtime, and GraphQL feature composition seams.

## 1.2.1

### Patch Changes

- af949dd: Deepen shared auth, query, Todo, storage upload, persistence, and API scope architecture behind focused Modules and Adapters.

## 1.2.0

### Minor Changes

- 7b286b2: Deepen shared auth transport, organization-scoped query cache helpers, upload lifecycle, persistence adapters, and server auth internals.

### Patch Changes

- 7af7edb: Deepen organization-scoped auth, data access, client organization selection, and session transport.

## 1.1.2

### Patch Changes

- 29a0d96: Deepen Authenticated Organization Scope and move Organization membership reads into the auth package.

## 1.1.1

### Patch Changes

- efcb73a: Backport template-safe runtime hardening, Docker support, bearer auth fallback, organization members wiring, mobile UI primitives, and generated AI assistant scaffold.
- Updated dependencies [efcb73a]
  - @repo/db@1.1.1

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

### Patch Changes

- Updated dependencies [42437fd]
  - @repo/db@1.1.0

## 1.0.0

### Major Changes

- 9633894: First release test

### Patch Changes

- Updated dependencies [9633894]
  - @repo/db@1.0.0
