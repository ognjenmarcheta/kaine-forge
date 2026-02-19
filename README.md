# kaine-forge monorepo

Production-oriented Turborepo + pnpm monorepo with:

- `apps/api` (GraphQL Yoga)
- `apps/web` (React + Vite)
- `apps/desktop` (Tauri v2 shell)
- `apps/mobile` (Expo + React Native)
- shared packages for auth/db/translation/ui/config/codegen

## Current phase status

- Phase 1: Foundation ✅
- Phase 2: API ✅
- Phase 3: Web ✅
- Phase 4: Desktop (Tauri) ✅
- Phase 5: Mobile ✅
- Phase 6: Polish/production-readiness ✅
- Phase 7: Quality gates (e2e + a11y + i18n lint) ✅

## Prerequisites

- Node.js `>=20` (CI uses Node 22)
- pnpm `10.29.3`
- Docker (local PostgreSQL)
- Rust toolchain (desktop/Tauri)

## Quickstart

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:ensure
pnpm db:push
pnpm db:seed
pnpm dev
```

## One-command bootstrap

```bash
pnpm initialize
```

`initialize` performs reinstall, build, database generate/push/seed, then starts dev tasks.

## Root scripts

- `pnpm dev` run all workspace dev tasks (with `--continue=always`)
- `pnpm build` build all workspaces
- `pnpm build:core` build API + Web (and dependency graph)
- `pnpm check` format/lint/typecheck/test across workspaces
- `pnpm check:ci` CI gate alias
- `pnpm test:e2e` run Playwright web/api e2e suite with a11y assertions
- `pnpm generate` GraphQL codegen
- `pnpm db:*` database lifecycle commands

## CI

Workflows:

- `.github/workflows/ci-pr.yml`
  - required fast gate for PRs (`format:check`, `lint`, `typecheck`, `test`)
  - core build gate (`build:core`)
  - e2e gate (`test:e2e`) with PostgreSQL service and Playwright artifacts
- `.github/workflows/security.yml`
  - dependency audit + secret scanning
- `.github/workflows/deep-checks.yml`
  - scheduled deeper checks (mobile export and desktop validation)

## Troubleshooting

### Mobile (Expo)

- If bundling or module resolution looks stale:

```bash
pnpm --filter @repo/mobile exec expo start -c
```

- If testing on physical device, set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_GRAPHQL_URL` to LAN IP, not `localhost`.

### Desktop (Tauri)

- Desktop dev expects web app at `http://localhost:3000`.

### E2E (Playwright)

- Ensure local Postgres is running and seeded (`pnpm db:ensure && pnpm db:push && pnpm db:seed`).
- `pnpm test:e2e` auto-installs Chromium on first run.
- E2E spins isolated servers on `http://127.0.0.1:3010` (web) and `http://127.0.0.1:4010` (api) to avoid conflicts with regular dev ports.
- `pnpm test:e2e` also runs `db:ensure` + `db:push` + `db:seed` before the suite.
- Run:

```bash
pnpm test:e2e
```

## Documentation

- Contributor guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Architecture decisions: `docs/adr/`
- Release checklist: `docs/release-checklist.md`
