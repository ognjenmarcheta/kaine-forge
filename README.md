<p align="center">
  <img src="media/logo.jpg" width="640" alt="Kaine Forge logo" />
</p>

<p align="center">
  <a href="https://github.com/ognjenmarcheta/kaine-forge/actions/workflows/ci-pr.yml"><img alt="CI PR" src="https://github.com/ognjenmarcheta/kaine-forge/actions/workflows/ci-pr.yml/badge.svg"></a>
  <a href="AGENTS.md"><img alt="AGENTS.md" src="https://img.shields.io/badge/AGENTS.md-generated-blue"></a>
  <a href="docs/agents/day-one.md"><img alt="Agent harnesses" src="https://img.shields.io/badge/agents-Claude%20%C2%B7%20Codex%20%C2%B7%20Cursor%20%C2%B7%20OpenCode%20%C2%B7%20Grok-8A2BE2"></a>
</p>

# Kaine Forge

Kaine Forge is a production-oriented, **agent-ready** Turborepo template for building a full-stack TypeScript product from one repository. It includes a GraphQL API, React web app, Tauri desktop shell, Expo mobile app, shared packages, release automation, and Docker build paths; one canonical `.ai/` source keeps five coding agents aligned with the repo's rules.

Use it when you want a reusable starter with strong defaults instead of a blank monorepo.

## What You Get

- `apps/api`: GraphQL Yoga API with better-auth sessions, organization-scoped data, Drizzle/Postgres, startup checks, optional production migrations, CORS/preflight handling, and cookie-first auth with bearer-token fallback.
- `apps/web`: React 19 and Vite SPA with root-aware env loading, API/GraphQL proxying, generated GraphQL hooks, design-system tokens, and nginx Docker runtime.
- `apps/desktop`: Tauri v2 shell around the web app.
- `apps/mobile`: Expo and React Native app using shared data/auth/translation packages and `@repo/mobile-ui`.
- `apps/e2e`: Playwright web/API tests with accessibility coverage.
- `packages/*`: shared auth, db, email, logger, config, feature flags, persistence, query helpers, storage, todos, translation, web UI, and mobile UI packages.
- `.ai/`: canonical agent scaffold — see [Agent-ready](#agent-ready).

## Agent-ready

Agents get the same encoded rules as humans — generated, linted, and drift-checked:

- [`AGENTS.md`](AGENTS.md) and `CLAUDE.md` are generated from canonical [`.ai/`](.ai/); `pnpm ai:install` targets Claude, Codex, Cursor, OpenCode, and Grok.
- `pnpm ai:doctor` catches skill lint errors, missing MCP requirements, and drift; strict mode runs in CI.
- `kaine-*` skills cover tests, review, PRs, CI fixes, releases, and triage.
- [`REVIEW.md`](REVIEW.md) is one review checklist for humans and agents; [`docs/agents/day-one.md`](docs/agents/day-one.md) is the day-one ramp.
- Repeated agent failures become lint rules, tests, or skills ([ADR 0009](docs/adr/0009-domain-knowledge-as-agent-infra.md)).

<!-- TEMPLATE_ONLY_START -->

## Is this the right template?

Kaine Forge assumes you are shipping one product across several surfaces from a single repository, with organization-scoped tenancy from the first commit and coding agents working in the repo alongside people.

It ships a GraphQL API, a React SPA, an Expo mobile app, a Tauri desktop shell, Playwright end-to-end tests, thirteen shared packages, a Docker build path per deployable app, and a generated agent scaffold.

Other templates fit other shapes better:

- [next-forge](https://github.com/vercel/next-forge) for a Next.js App Router SaaS.
- [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo) for the T3 stack with Expo and a smaller surface.
- [Nx](https://nx.dev) when you want generators and a plugin platform.
- [Turborepo examples](https://github.com/vercel/turborepo/tree/main/examples) for minimal wiring to build on.

<!-- TEMPLATE_ONLY_END -->

## Prerequisites

- Node.js `>=22` (single-sourced from `.nvmrc`; CI and Docker images use Node 22)
- pnpm `10.29.3`
- Docker Desktop or compatible Docker runtime for Postgres, MinIO, and image builds
- Rust toolchain for desktop/Tauri work
- Optional: [Graphify](https://github.com/Graphify-Labs/graphify) CLI (`uv tool install "graphifyy[sql,mcp]"`) for the `pnpm graph` codebase knowledge graph
- Optional: [gitleaks](https://github.com/gitleaks/gitleaks) (`brew install gitleaks`) for the `pnpm scan:secrets` full-history secret scan

## Quickstart

```bash
cp .env.example .env
docker compose up -d --wait
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
pnpm quick-setup
```

`quick-setup` starts the Docker services (Postgres, MinIO), then runs `initialize` → `bootstrap` (env, install, AI files, build of every workspace except `@repo/desktop`, db seed) and finally `dev`. AI assistant files install non-interactively during bootstrap. The Tauri desktop compile stays out of bootstrap; run `pnpm --filter @repo/desktop build` when you need it (Rust toolchain required). Use `pnpm bootstrap` alone when the services are already running and you want the environment prepared without starting `dev` (it assumes Postgres is reachable).

Scaffold a new shared package: `pnpm create:package <kebab-name>`.

### Optional: remote Turbo cache

For faster CI and local rebuilds, set repository secret `TURBO_TOKEN` and variable `TURBO_TEAM` (Vercel Remote Cache or compatible). See [CONTRIBUTING.md](CONTRIBUTING.md#ci-speed-maintainers).

Common failures: [`docs/troubleshooting.md`](docs/troubleshooting.md).

<!-- TEMPLATE_ONLY_START -->

## Template adoption

If you created a repo from this GitHub template, adopt product identity **before** full bootstrap:

```bash
pnpm install
pnpm template:adopt --write
pnpm ai:install && pnpm ai:doctor && pnpm template:adopt --check
```

Full steps (interactive dry-run, `template-adoption.json`, post-adopt checklist): [`CONTRIBUTING.md`](CONTRIBUTING.md#template-adoption).

<!-- TEMPLATE_ONLY_END -->

## Where to go next

| Need                                                          | Doc                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| Architecture, FDD, GraphQL/data, env vars, Docker, mobile LAN | [`MONOREPO_GUIDE.md`](MONOREPO_GUIDE.md)                 |
| Design tokens, theming, web/mobile UI rules                   | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)                   |
| Domain language (Organization, scope, invitations)            | [`CONTEXT.md`](CONTEXT.md)                               |
| PR workflow, checks, release, AI install                      | [`CONTRIBUTING.md`](CONTRIBUTING.md)                     |
| Production auth hardening, reporting                          | [`SECURITY.md`](SECURITY.md)                             |
| Review checklist                                              | [`REVIEW.md`](REVIEW.md)                                 |
| Agent day-one ramp                                            | [`docs/agents/day-one.md`](docs/agents/day-one.md)       |
| Release validation                                            | [`docs/release-checklist.md`](docs/release-checklist.md) |
| Full documentation index                                      | [`docs/README.md`](docs/README.md)                       |

**Everyday commands:** `pnpm preflight` · `pnpm check` · `pnpm generate` · `pnpm build:core` · `pnpm test:e2e` · `pnpm ai:install` · `pnpm ai:doctor` · `pnpm release:apps --dry-run` · `pnpm dev:mobile:lan`

## License

MIT — see [`LICENSE`](LICENSE).
