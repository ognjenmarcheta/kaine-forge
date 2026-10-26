# ADR 0017: Keep pnpm and Turborepo; do not adopt Bun or Vite+ yet

- Status: Accepted
- Date: 2026-10-26

## Context

We asked whether Bun or [Vite+](https://voidzero.dev/posts/announcing-vite-plus-1-0) would make CI and local tooling faster.

Measured on PR runs of 2026-10-26 (`ubuntu-latest`, run 40320609082, 8 min 14 s):

| Step            | Time      | Cause                                                                          |
| --------------- | --------- | ------------------------------------------------------------------------------ |
| Check Fast      | 155–265 s | Turbo format/lint/typecheck hit 0 of 29 tasks in cache; `ai:test` ran serially |
| Build Core Apps | 31–47 s   | Waited for Check Fast, though e2e needs only the build                         |
| E2E Web/API x2  | 217–247 s | Playwright 161 s, one worker per shard                                         |
| `pnpm install`  | 15–20 s   | Per job, with the pnpm store cache                                             |

The time went to job order and cache misses. The Turbo cache was one `actions/cache` blob per job, and its restore prefix took the newest blob from any job.

Tool status on the decision date:

- **Vite+ 1.0** (2026-09-28) bundles Vite, Vitest, Oxlint, Oxfmt, tsdown, and the `vp run` task runner. It replaces ESLint and Prettier, which ADR 0016 keeps for the policy rules. `vp run` has no remote cache in 1.0 and no counterpart to `turbo boundaries`. The repo already uses Vite 8 with Rolldown, the largest speed part of Vite+.
- **Bun** (1.3/1.4) has isolated installs and a fast runtime. Install is not the bottleneck (15–20 s). The repo depends on pnpm catalogs, `minimumReleaseAge` (the Dependabot cooldown gate), `overrides`, `patchedDependencies`, and Expo, whose guide reports React Native breakage under isolated installs.
- **pnpm 12** (2026-08-26) is a Rust rewrite with the same lockfile format. pnpm reports clean installs about 2x faster and warm repeat installs about 30x faster than pnpm 11.

## Decision

Keep pnpm and Turborepo. Do not adopt Bun or Vite+.

Fix the measured causes instead:

- `ci-pr.yml`: Build Core Apps runs beside Check Fast; the root AI and script tests run in their own job.
- `ci-pr.yml`, `release.yml`: a per-task Turbo cache in the GitHub Actions cache (`rharkor/caching-for-turbo`).
- Upgrade pnpm to 12 in its own change.

## Alternatives Considered

- Vite+: replaces the ESLint policy layer (ADR 0016) and Turborepo boundaries and remote caching, for a speed gain the repo mostly has through Vite 8.
- Bun as package manager: a migration of catalogs, the release-age gate, overrides, and patches, for a step that takes 15–20 s.
- Bun as script runtime in place of `tsx`: small gain; the scripts and the Docker images target Node.
- Vercel Remote Cache: needs an external account and a token secret, and fork PRs cannot read secrets.

## Consequences

- Pros:
  - No change to tooling, guides, skills, or adopters' setup.
  - The measured causes are fixed at the source.
- Cons:
  - Local lint stays near 40 s (ADR 0016).
  - Revisit when one trigger holds:
    - `vp run` ships remote caching and a package boundary check.
    - Bun supports pnpm catalogs, a release-age gate, and Expo under isolated installs.
    - Install time becomes a measured CI bottleneck after the pnpm 12 upgrade.
