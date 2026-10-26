# ADR 0003: Fast Required PR Gate + Deeper Scheduled Checks

- Status: Accepted
- Date: 2026-02-18

## Context

The monorepo contains web, API, desktop, mobile, and shared packages. Running full heavy validation on every PR slows feedback loops.

## Decision

Use a two-tier CI strategy:

1. Required PR gate (fast):
   - AI assistant generated-file drift check
   - format/lint/typecheck/test
   - coverage threshold
   - core build (API + web dependency graph)
2. Scheduled/manual deep checks:
   - mobile export validation
   - desktop-specific validation

## Consequences

- Pros:
  - fast signal on everyday PRs
  - deeper confidence on schedule without blocking iteration speed
- Cons:
  - deep runtime issues may appear after PR merge window
  - requires active monitoring of scheduled workflow failures

## Status update (2026-09-09)

- Mobile Export Validation now also runs in the required PR gate on pull requests that touch mobile paths (`ci-pr.yml`, issue #305 / PR #313). Deep Checks keeps the scheduled run.
- `docker-cache.yml` builds both images on pushes to `main` to seed the Docker layer cache that PR branches fall back to (issue #359 / PR #364).

## Status update (2026-10-26)

- Build Core Apps, and so e2e, no longer waits for Check Fast. Both start after Detect Changed Paths. The PR Quality Gate still needs every job, so a Check Fast failure still blocks the merge.
- The root `.ai/` checks and the `scripts/*.test.mjs` tests moved from Check Fast to their own job, AI and Script Checks.
- Coverage, core build and e2e, each Docker image, and the mobile jobs run only when the Turbo package graph (`turbo ls --affected`, `scripts/ci-affected.mjs`) says the PR affects them. Files outside the graph and non-PR events run every job.
- The Turbo cache moved from one `actions/cache` blob per job to a per-task cache in the GitHub Actions cache (`rharkor/caching-for-turbo`). ADR 0017 records the measurements.
