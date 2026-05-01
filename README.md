# Kaine Forge

Kaine Forge is a production-oriented Turborepo template for building a full-stack TypeScript product from one repository. It includes a GraphQL API, React web app, Tauri desktop shell, Expo mobile app, shared packages, release automation, Docker build paths, and an AI assistant scaffold that keeps multiple coding tools aligned.

Use it when you want a reusable starter with strong defaults instead of a blank monorepo.

## What You Get

- `apps/api`: GraphQL Yoga API with better-auth sessions, organization-scoped data, Drizzle/Postgres, startup checks, optional production migrations, CORS/preflight handling, and cookie-first auth with bearer-token fallback.
- `apps/web`: React 19 and Vite SPA with root-aware env loading, API/GraphQL proxying, generated GraphQL hooks, design-system tokens, and nginx Docker runtime.
- `apps/desktop`: Tauri v2 shell around the web app.
- `apps/mobile`: Expo and React Native app using shared data/auth/translation packages and `@repo/mobile-ui`.
- `apps/e2e`: Playwright web/API tests with accessibility coverage.
- `packages/*`: shared auth, db, logger, config, feature flags, query helpers, storage, translation, web UI, and mobile UI packages.
- `.ai/`: canonical AI assistant guide, skills, MCP catalog, Cursor rules, and Serena seed files.

## Prerequisites

- Node.js `>=20` (CI uses Node 22)
- pnpm `10.29.3`
- Docker Desktop or compatible Docker runtime for Postgres, MinIO, and image builds
- Rust toolchain for desktop/Tauri work

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

The dev command runs all workspace dev tasks through Turborepo. To scope commands, stay at the repo root and use `pnpm --filter <workspace> <script>`.

Examples:

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/web typecheck
pnpm --filter @repo/mobile-ui typecheck
```

## One-Command Bootstrap

```bash
pnpm initialize
```

`initialize` reinstalls dependencies, builds the repo, generates/pushes/seeds the database, then starts development tasks.

## Environment

Start from `.env.example`. Important variables:

- `DATABASE_URL`: Postgres connection string. `sslmode=verify-ca` and `sslmode=verify-full` enable strict certificate verification; other SSL modes use safer non-strict TLS handling when present.
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`: auth runtime settings.
- `API_RUN_MIGRATIONS`: optional boolean. Defaults to `false` outside production and `true` in production.
- `API_CORS_ORIGINS`: comma-separated allowlist for browser/API origins.
- `API_GRAPHQL_MAX_DEPTH`: GraphQL query depth cap.
- `ORGANIZATIONS_VISIBLE`, `VITE_ORGANIZATIONS_VISIBLE`, `EXPO_PUBLIC_ORGANIZATIONS_VISIBLE`: members/organization UI visibility flags.
- `VITE_API_PROXY_TARGET`: optional Vite dev proxy target for `/api` and `/graphql`; defaults to `http://localhost:4000`.
- `VITE_API_URL`, `VITE_GRAPHQL_URL`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GRAPHQL_URL`: client runtime URLs.
- `S3_*`: S3-compatible storage settings. Local development uses MinIO from `docker-compose.yml`.

Auth is cookie-first. The API also accepts `Authorization: Bearer <session-token>` for desktop, webview, and cross-origin cases where cookie transport is unreliable.

## GraphQL and Database Flow

- API SDL lives in feature modules under `apps/api/src/features/*`.
- Runtime schema and schema generation share the same central feature registry.
- The committed API schema is `apps/api/schema.graphql`.
- Web and mobile GraphQL operations live under `apps/{web,mobile}/src/graphql/operations`.
- Generated client artifacts live under `apps/{web,mobile}/src/graphql/generated`.

Common commands:

```bash
pnpm generate
pnpm db:generate
pnpm db:push
pnpm db:migrate
pnpm db:seed
```

`@repo/db/migrate` exports `runMigrations()` for API startup and deployment workflows.

## Docker

The API and web images use Turborepo prune so image builds only install the needed workspace graph.

```bash
docker build -f Dockerfile.api -t kaine-forge-api .
docker build -f Dockerfile.web -t kaine-forge-web .
```

The API image runs `node apps/api/dist/index.js`. The web image serves `apps/web/dist` through nginx on port `3000`, proxies `/api` and `/graphql` to `API_BACKEND_URL`, supports GraphQL websocket upgrades, and falls back to `index.html` for SPA routes.

Example web runtime:

```bash
docker run --rm -p 3000:3000 -e API_BACKEND_URL=http://host.docker.internal:4000 kaine-forge-web
```

## AI Assistant Scaffold

`.ai/` is the source of truth for shared AI assistant guidance.

- `.ai/guide.md`: guide content installed into `AGENTS.md` and `CLAUDE.md`.
- `.ai/skills/kaine-*.md`: team-managed canonical skill sources.
- `.ai/mcp.json`: shared MCP catalog with `${VAR}` placeholders.
- `.ai/mcp.env.example`: local env template for MCP substitution.
- `.ai/mcp.json.example`: personal MCP override example for `.ai.local/mcp.json`.
- `.ai/cursor-rules.md`: Cursor rules source.
- `.ai/serena-project.yml` and `.ai/serena-memories/*.md`: canonical Serena sources.

Run after changing canonical AI files:

```bash
pnpm ai:install
pnpm ai:doctor
```

Installed agent outputs are local and gitignored, including `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.mcp.json`, `.codex/config.toml`, `.cursor/mcp.json`, and `opencode.json`. Personal MCP values and overrides live in `.ai.local/`.

## Quality Gates

Common validation:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build:core
pnpm test:e2e
```

`pnpm check` runs format, lint, typecheck, and tests. CI also runs `pnpm ai:doctor`, coverage, core builds, and Playwright e2e.

## Release Flow

Changesets are used for release metadata and changelog/version updates.

```bash
pnpm changeset
pnpm release:status
pnpm release:version
pnpm release:publish
```

Source changes in `apps/**`, `packages/**`, or `tooling/**` need a `.changeset/*.md` file unless the PR is intentionally non-releasable and labeled `release:skip-changeset`.

## Template Adoption Checklist

1. Replace Kaine Forge naming, repository links, and deployment URLs with product-specific values.
2. Remove the `TEMPLATE_POLICY_BLOCK` sections from `MONOREPO_GUIDE.md` and `DESIGN_SYSTEM.md`.
3. Replace template compatibility policy with your product compatibility/versioning policy.
4. Rotate all secrets and rewrite `.env.example` defaults for your environments.
5. Review `.ai/` skills and MCP placeholders; add org-specific integrations only in downstream projects.
6. Confirm CI required checks and branch protection match your team workflow.

## Documentation Map

- `MONOREPO_GUIDE.md`: architecture, FDD conventions, runtime rules, scripts, and feature workflow.
- `DESIGN_SYSTEM.md`: token system, theming, UI rules, accessibility, and mobile/web styling split.
- `CONTRIBUTING.md`: branch, PR, checks, and release contribution workflow.
- `SECURITY.md`: vulnerability reporting and hardening expectations.
- `docs/README.md`: documentation index.
- `docs/adr/`: architecture decision records.
- `docs/release-checklist.md`: release validation checklist.
