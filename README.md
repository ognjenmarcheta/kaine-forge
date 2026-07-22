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

## How it compares

Capability-focused snapshot against common TypeScript monorepo starters (not a popularity ranking):

|                                                              | Multi-app product |  Org tenancy   |   Mobile    |   Desktop   | AI agent scaffold | Famous |
| ------------------------------------------------------------ | :---------------: | :------------: | :---------: | :---------: | :---------------: | :----: |
| **[Kaine Forge](https://github.com/ognjenmarcheta/kaine-forge)** |        ✅         | ✅ first-class |   ✅ Expo   |  ✅ Tauri   |   ✅ strongest    | ❌ yet |
| [next-forge](https://github.com/vercel/next-forge)           |    ✅ web SaaS    | partial/varies | ❌ typical  |     ❌      |       weak        |   ✅   |
| [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo) |    ✅ starter     |  via packages  |   ✅ Expo   | ❌ default  |       weak        |  ✅✅  |
| [Nx integrated](https://nx.dev/docs/concepts/integrated-vs-package-based) |     platform      |      DIY       | via plugins | via plugins |      growing      |  ✅✅  |
| [Turbo kitchen-sink](https://github.com/vercel/turborepo/tree/main/examples/kitchen-sink) |       demo        |       ❌       |    demo     |     ❌      |        ❌         |   ✅   |

### Verdict

**Kaine Forge** is for teams shipping a multi-platform product monorepo: web + API + Expo mobile + Tauri desktop, organization-scoped multi-tenant defaults, token design systems, Docker release contracts, and a first-class AI assistant scaffold so agents stay aligned with repo rules.

It is not a Next.js App Router / RSC marketing starter, not an enterprise monorepo platform with generators, and not a blank Turbo kitchen-sink. The matrix above is for capability fit—not a suggestion to use another template when those other lanes matter more to you.

## Prerequisites

- Node.js `>=22` (single-sourced from `.nvmrc`; CI and Docker images use Node 22)
- pnpm `10.29.3`
- Docker Desktop or compatible Docker runtime for Postgres, MinIO, and image builds
- Rust toolchain for desktop/Tauri work
- Optional: [Graphify](https://github.com/Graphify-Labs/graphify) CLI (`uv tool install "graphifyy[sql,mcp]"`) for the `pnpm graph` codebase knowledge graph

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

Scope commands from the repo root with `pnpm --filter <workspace> <script>` (for example `pnpm --filter @repo/api test`).

### One-command bootstrap

```bash
docker compose up -d
pnpm quick-setup
```

`quick-setup` / `initialize` ensures `.env`, reinstalls deps, installs AI assistant files, builds, prepares and seeds the database, then starts dev. Postgres must already be running.

Common failures: [`docs/troubleshooting.md`](docs/troubleshooting.md).

## Template adoption

If you created a repo from this GitHub template, adopt product identity **before** full bootstrap:

```bash
pnpm install
pnpm template:adopt --write
pnpm ai:install && pnpm ai:doctor && pnpm template:adopt --check
```

Full steps (interactive dry-run, `template-adoption.json`, post-adopt checklist): [`CONTRIBUTING.md`](CONTRIBUTING.md#template-adoption).

## Where to go next

| Need | Doc |
| ---- | --- |
| Architecture, FDD, GraphQL/data, env vars, Docker, mobile LAN | [`MONOREPO_GUIDE.md`](MONOREPO_GUIDE.md) |
| Design tokens, theming, web/mobile UI rules | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) |
| Domain language (Organization, scope, invitations) | [`CONTEXT.md`](CONTEXT.md) |
| PR workflow, checks, release, AI install | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Production auth hardening, reporting | [`SECURITY.md`](SECURITY.md) |
| Review checklist | [`REVIEW.md`](REVIEW.md) |
| Agent day-one ramp | [`docs/agents/day-one.md`](docs/agents/day-one.md) |
| Release validation | [`docs/release-checklist.md`](docs/release-checklist.md) |
| Full documentation index | [`docs/README.md`](docs/README.md) |

**Everyday commands:** `pnpm check` · `pnpm generate` · `pnpm build:core` · `pnpm test:e2e` · `pnpm ai:install` · `pnpm ai:doctor` · `pnpm release:apps --dry-run` · `pnpm dev:mobile:lan`
