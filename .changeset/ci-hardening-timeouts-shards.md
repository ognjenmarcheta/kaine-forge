---
"@repo/e2e": patch
"@repo/desktop": patch
---

Harden CI against hung jobs and unshardable bottlenecks.

Every job in all five workflows now declares `timeout-minutes` (15 jobs total). None did before, so GitHub's 360-minute default applied — a hung Playwright `webServer` or `expo export` could burn six hours of runner time per attempt.

`Coverage Threshold` moved out of `check-fast` into its own parallel job. It is a full-repo vitest run and cannot be affected-scoped, because the global and per-path thresholds are computed across all projects. Serializing it behind the affected gate made the fast gate as slow as the entire test suite.

E2E now shards across two jobs, each with its own Postgres service. Sharding is across jobs rather than workers on purpose: four of the five specs sign in as the same seeded user, and `web-organizations.e2e.ts` switches that user's active organization while `web-auth-todos` and `web-notes-flows` operate on organization-scoped rows, so concurrent workers would race on `activeOrganizationId`. That constraint is now recorded in `apps/e2e/playwright.config.ts` so `fullyParallel` is not "optimized" on later. Shard count is 2 rather than 4 because the suite is 5 tests in 4 files and every shard re-pays install, `build:core`, browser install, and db seed. Shards emit blob reports that a new `e2e-report` job merges into one HTML report, uploaded even when a shard fails.

New `Desktop Tauri Build (macOS)` job in Deep Checks. `desktop-check` only runs format, lint, typecheck, and test — the Rust side was never compiled anywhere in CI, so a broken `src-tauri/` or Cargo bump could reach `main` undetected. The job runs `tauri build --no-bundle` on `macos-latest` with a Cargo registry and target cache.

Added `concurrency` groups to Deep Checks, Security, and PR Labeler; only CI PR and Release had them, so overlapping scheduled or rapid-push runs could previously pile up.
