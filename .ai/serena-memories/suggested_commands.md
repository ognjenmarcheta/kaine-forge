# Suggested Commands

- Install: `pnpm install`
- Onboarding bootstrap: `pnpm quick-setup`
- Dev: `pnpm dev`
- Generate GraphQL: `pnpm generate`
- Format check: `pnpm format:check`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Coverage: `pnpm coverage`
- E2E: `pnpm test:e2e`
- Full check: `pnpm check`
- Build API and web: `pnpm run build:core`
- Release branches: updated by the Release workflow; manual `pnpm release:apps` (including dry-runs) is human-only.
- DB generate: `pnpm db:generate`
- Local DB push: `pnpm db:push:local` with explicit `ALLOW_LOCAL_DB_PUSH=true`; shared/deployed DBs use reviewed migrations.
- DB migrate: `pnpm db:migrate`
- DB seed: `pnpm db:seed`
- Install AI files: `pnpm ai:install`
- Check AI setup and drift: `pnpm ai:doctor`
- Build knowledge graph (optional Graphify CLI): `pnpm graph`
- Refresh knowledge graph incrementally: `pnpm graph:update`
- Adopt template identity: `pnpm template:adopt`
- Docker API build: `docker build -f Dockerfile.api -t kaine-forge-api .`
- Docker web build: `docker build -f Dockerfile.web -t kaine-forge-web .`

Scoped examples:

- `pnpm --filter @repo/api test`
- `pnpm --filter @repo/web test`
- `pnpm --filter @repo/mobile-ui typecheck`
- `pnpm --filter @repo/mobile typecheck`
