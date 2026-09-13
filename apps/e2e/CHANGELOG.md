# @repo/e2e

## 1.1.2

### Patch Changes

- 6907d18: Refresh Notes with a responsive list and editor, full Organization-scoped title/body search, pagination, explicit saving, protected per-note drafts, and clearer checklist feedback. Preserve newer edits during saves and prevent accidental draft loss during navigation and Organization changes.
- db46fcf: Refresh Todos with inline creation, searchable status views, pagination, protected drafts, and clearer action and attachment feedback. Keep text edits separate from completion changes across web and mobile, and preserve Organization scoping.
- 4143c11: Refresh the AI Assistant with a responsive conversation workspace, a growing keyboard-accessible composer, per-conversation drafts, and readable Todo and Note results. Keep replies attached to their originating conversation during navigation and preserve prompts after failures.
- c67b66a: Start Playwright servers with explicit environment maps so the same test commands work on Windows and Unix.

## 1.1.1

### Patch Changes

- dfb7d91: Harden CI against hung jobs and unshardable bottlenecks.

  Every job in all five workflows now declares `timeout-minutes` (15 jobs total). None did before, so GitHub's 360-minute default applied — a hung Playwright `webServer` or `expo export` could burn six hours of runner time per attempt.

  `Coverage Threshold` moved out of `check-fast` into its own parallel job. It is a full-repo vitest run and cannot be affected-scoped, because the global and per-path thresholds are computed across all projects. Serializing it behind the affected gate made the fast gate as slow as the entire test suite.

  E2E now shards across two jobs, each with its own Postgres service. Sharding is across jobs rather than workers on purpose: four of the five specs sign in as the same seeded user, and `web-organizations.e2e.ts` switches that user's active organization while `web-auth-todos` and `web-notes-flows` operate on organization-scoped rows, so concurrent workers would race on `activeOrganizationId`. That constraint is now recorded in `apps/e2e/playwright.config.ts` so `fullyParallel` is not "optimized" on later. Shard count is 2 rather than 4 because the suite is 5 tests in 4 files and every shard re-pays install, `build:core`, browser install, and db seed. Shards emit blob reports that a new `e2e-report` job merges into one HTML report, uploaded even when a shard fails.

  New `Desktop Tauri Build (macOS)` job in Deep Checks. `desktop-check` only runs format, lint, typecheck, and test — the Rust side was never compiled anywhere in CI, so a broken `src-tauri/` or Cargo bump could reach `main` undetected. The job runs `tauri build --no-bundle` on `macos-latest` with a Cargo registry and target cache.

  Added `concurrency` groups to Deep Checks, Security, and PR Labeler; only CI PR and Release had them, so overlapping scheduled or rapid-push runs could previously pile up.

- bfde85a: Deferred audit backlog hardening:
  - `@repo/e2e`: add behavioral Playwright coverage for register/login/logout and todo create/complete/delete flows with i18n-safe selectors, and fix the harness so browser GraphQL goes through the Vite proxy to the e2e API instead of the dev port from `.env`.
  - `@repo/mobile-ui`: add a vitest + jsdom test harness with a typed react-native stub and behavior tests for the Button, Checkbox, Badge, Text, and Input primitives.
  - `@repo/web`: raise the 12px todo attachment captions from `--ds-text-subtlest` to `--ds-text-subtle` to meet WCAG AA contrast (was 3.22:1 on white).

- d5613be: Add Playwright notes create/list flow and document invitation/attachment CI gaps.
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

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

## 1.0.0

### Major Changes

- 9633894: First release test
