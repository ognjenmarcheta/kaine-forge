# Suggested Commands

- Install: `pnpm install`
- Dev: `pnpm dev`
- Generate GraphQL: `pnpm generate`
- Format check: `pnpm format:check`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Full check: `pnpm check`
- Build API and web: `pnpm run build:core`
- DB generate: `pnpm db:generate`
- DB push: `pnpm db:push`
- DB migrate: `pnpm db:migrate`
- DB seed: `pnpm db:seed`
- Sync AI files: `pnpm ai:sync`
- Check AI file drift: `pnpm ai:sync:check`
- Docker API build: `docker build -f Dockerfile.api -t kaine-forge-api .`
- Docker web build: `docker build -f Dockerfile.web -t kaine-forge-web .`

Scoped examples:

- `pnpm --filter @repo/api test`
- `pnpm --filter @repo/web test`
- `pnpm --filter @repo/mobile-ui typecheck`
- `pnpm --filter @repo/mobile typecheck`
