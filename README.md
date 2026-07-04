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
pnpm quick-setup
```

`quick-setup` runs the same bootstrap as `initialize`: it reinstalls dependencies, installs local AI assistant files, builds the repo, generates/pushes/seeds the database, then starts development tasks.

## Environment

Start from `.env.example`. Important variables:

- `DATABASE_URL`: Postgres connection string. `sslmode=verify-ca` and `sslmode=verify-full` enable strict certificate verification; other SSL modes use safer non-strict TLS handling when present.
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`: better-auth's native secret and public base URL. better-auth owns `/api/auth/*`.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: optional OAuth credentials. Each provider activates only when both its id and secret are set; leave blank to disable that provider.
- `VITE_AUTH_SOCIAL_PROVIDERS`: optional comma-separated list (for example `github,google`) controlling which social sign-in buttons the web login shows. `EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS` is reserved; mobile social login is deferred pending `@better-auth/expo` deep-link support.
- `API_HOST`: optional API listen host. Use `0.0.0.0` when the API needs to accept LAN traffic from a physical phone.
- `API_RUN_MIGRATIONS`: optional boolean. Defaults to `false` outside production and `true` in production.
- `API_CORS_ORIGINS`: comma-separated allowlist for browser/API origins. **Dual-purpose:** it feeds both CORS and better-auth's `trustedOrigins`. A browser-facing web origin missing from this list makes sign-in/sign-up fail with `403 INVALID_ORIGIN` (which looks like an auth failure, not a CORS error), so every web origin must be listed. Note the wildcard asymmetry: better-auth pattern-matches `trustedOrigins`, but our CORS reflection is exact-match — do not rely on wildcards.
- `API_GRAPHQL_MAX_DEPTH`: GraphQL query depth cap.
- `API_RATE_LIMIT_ENABLED`, `API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS`: in-memory rate limiting for `/api/auth/*` and `/graphql` (enabled by default outside tests; 100 requests per 60s window).
- `API_TRUST_PROXY`: set `true` only when the API sits behind a trusted reverse proxy; enables client identification via the rightmost `x-forwarded-for` entry for rate limiting.
- `EMAIL_PROVIDER`: email delivery adapter (`console` logs messages in development; add real providers in `@repo/email`).
- `AUTH_REQUIRE_EMAIL_VERIFICATION`: optional boolean (default `false`). When `true`, signup issues a verification email (soft mode: the session is still created and `emailVerified` is exposed on the session user for downstream gating).
- `ORGANIZATIONS_VISIBLE`, `VITE_ORGANIZATIONS_VISIBLE`, `EXPO_PUBLIC_ORGANIZATIONS_VISIBLE`: members/organization UI visibility flags.
- `VITE_API_PROXY_TARGET`: optional Vite dev proxy target for `/api` and `/graphql`; defaults to `http://localhost:4000`.
- `VITE_API_URL`, `VITE_GRAPHQL_URL`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GRAPHQL_URL`: client runtime URLs.
- `S3_*`: S3-compatible storage settings. Local development uses MinIO from `docker-compose.yml`.

Auth is cookie-first (cookie `kaine.session_token`). The API also accepts `Authorization: Bearer <session-token>` for desktop, webview, and cross-origin cases where cookie transport is unreliable. Password reset is requested at `/api/auth/request-password-reset` (better-auth 1.6).

## Mobile Device Testing

For a physical phone, `localhost` points at the phone, not your laptop. Use the LAN workflow when testing the Expo app against the API running on your machine:

```bash
pnpm dev:mobile:lan
```

The command detects your laptop LAN IPv4 address, starts the API on `0.0.0.0`, starts Expo with `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_GRAPHQL_URL` pointed at that LAN address, and clears Metro's cache. Keep the phone and laptop on the same Wi-Fi, allow incoming connections to port `4000` if your firewall asks, and open the printed API URL in the phone browser before testing login. If the detected address is wrong, override it:

```bash
MOBILE_LAN_IP=192.168.1.42 pnpm dev:mobile:lan
```

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

The API and web images use Turborepo prune so image builds only install the needed workspace graph. Both images define `HEALTHCHECK` directives: the API image probes `GET /health` (liveness; `GET /ready` additionally verifies database connectivity for orchestrator readiness probes) and the web image probes nginx.

```bash
docker build -f Dockerfile.api -t kaine-forge-api .
docker build -f Dockerfile.web -t kaine-forge-web .
```

The API image runs `node apps/api/dist/index.js`. The web image serves `apps/web/dist` through nginx on port `3000`, proxies `/api` and `/graphql` to `API_BACKEND_URL`, supports GraphQL websocket upgrades, and falls back to `index.html` for SPA routes.

Each top-level `Dockerfile.<app>` also defines a deployable app branch contract. After app-affecting changes are merged to `main`, run `pnpm release:apps` to create or fast-forward only the matching `release/<app>` branches. Use `pnpm release:apps --apps all` once to initialize every deployable app branch intentionally.

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

Initial setup also runs `pnpm ai:install` through `pnpm quick-setup` and `pnpm initialize`, so generated assistant files are available before normal development starts.

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
pnpm release:apps --dry-run
pnpm release:apps
pnpm release:status
pnpm release:version
pnpm release:publish
```

Source changes in `apps/**`, `packages/**`, or `tooling/**` need a `.changeset/*.md` file unless the PR is intentionally non-releasable and labeled `release:skip-changeset`.

Run `pnpm release:apps` from synced `main` after merging changes that affect deployable apps. The command uses the workspace graph so shared package changes update every affected deployable app branch without redeploying unrelated apps.

## Template Adoption

After creating a new repository from this GitHub template, run adoption once before `pnpm initialize` or normal runtime bootstrap. Adoption replaces active Kaine Forge identity with your downstream product identity while preserving internal `@repo/*` package names and imports.

Interactive adoption:

```bash
pnpm install
pnpm template:adopt
```

Review the dry-run output. When the resolved values are correct, apply the changes and refresh generated assistant files:

```bash
pnpm template:adopt --write
pnpm ai:install
pnpm ai:doctor
pnpm template:adopt --check
```

For repeatable non-interactive adoption, create `template-adoption.json`:

```json
{
  "productName": "Acme Ops",
  "desktopIdentifier": "com.acme.ops.desktop",
  "compatibilityPolicy": "Acme Ops follows semver for public package exports and documents breaking changes in release notes.",
  "designCompatibilityPolicy": "Acme Ops treats token and component contract changes as product design decisions documented before release."
}
```

Then run:

```bash
pnpm install
pnpm template:adopt --config template-adoption.json --write
pnpm ai:install
pnpm ai:doctor
pnpm template:adopt --check
```

The adoption command updates product naming, package and repository slugs, Docker examples, environment defaults, app display names, Tauri metadata, translation app names, canonical `.ai/` guidance, and template policy blocks.

After adoption:

1. Rotate all secrets and rewrite `.env.example` defaults for your environments.
2. Review remaining `pnpm template:adopt --check` findings and keep only intentional historical references.
3. Review `.ai/` skills and MCP placeholders; add org-specific integrations only in downstream projects.
4. Confirm CI required checks and branch protection match your team workflow.

## Documentation Map

- `MONOREPO_GUIDE.md`: architecture, FDD conventions, runtime rules, scripts, and feature workflow.
- `DESIGN_SYSTEM.md`: token system, theming, UI rules, accessibility, and mobile/web styling split.
- `CONTRIBUTING.md`: branch, PR, checks, and release contribution workflow.
- `SECURITY.md`: vulnerability reporting and hardening expectations.
- `docs/README.md`: documentation index.
- `docs/adr/`: architecture decision records.
- `docs/release-checklist.md`: release validation checklist.
