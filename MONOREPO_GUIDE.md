# Monorepo Guide

This is the authoritative engineering guide for Kaine Forge. Read it before generating, modifying, or reviewing code. Use `DESIGN_SYSTEM.md` as the companion authority for visual language, design tokens, theming, and component styling behavior.

<!-- TEMPLATE_POLICY_BLOCK_START -->

Kaine Forge is a boilerplate template. The rules here describe current best-practice defaults for new projects, not backward-compatibility promises for old conventions.

When adopting this template for a product repository, remove this `TEMPLATE_POLICY_BLOCK` and replace it with your product compatibility and versioning policy.

<!-- TEMPLATE_POLICY_BLOCK_END -->

## 1. Project Identity

- Type: Turborepo and pnpm workspace monorepo.
- Architecture: Feature-Driven Development (FDD).
- Language: strict TypeScript everywhere. Do not use `any` except in generated code.
- Platforms: React/Vite web, Tauri desktop, Expo/React Native mobile, GraphQL Yoga API.
- Data model: organization-scoped by default through better-auth with organization membership.
- Styling: token-only design system. See `DESIGN_SYSTEM.md`.

## 2. Workspace Topology

```text
kaine-forge/
  apps/
    api/       GraphQL Yoga API and API feature modules
    web/       React 19 + Vite SPA
    desktop/   Tauri v2 shell around the web app
    mobile/    Expo / React Native app
    e2e/       Playwright end-to-end tests
  packages/
    auth/          better-auth instance (organization + bearer plugins), custom scrypt password hooks, and the session/read facade
    config/        ESLint, TypeScript, Prettier, and Tailwind configuration
    db/            Drizzle schema, validators, migrations, seed, migrate export
    email/         provider-agnostic email sending (console adapter, EMAIL_PROVIDER factory)
    feature-flags/ config-driven feature flags
    logger/        shared logger setup
    mobile-ui/     React Native primitives and NativeWind variants
    persistence/   Zustand storage adapters (sync/async)
    query/         shared React Query keys and cache helpers
    storage/       S3-compatible storage helpers
    todos/         shared Todo workflow and attachment helpers
    translation/   i18next config and locale files
    ui/            React DOM design-system primitives and composed UI
  tooling/
    graphql-codegen/ GraphQL Code Generator config
```

All internal packages use the `@repo/*` scope. Import through package exports only, never through internal source paths. ESLint forbids `@repo/*/src/**` deep imports, `@repo/ui` inside mobile, and `@repo/mobile-ui` inside web/desktop.

### Dependency catalogs (pnpm)

Shared third-party versions live in `pnpm-workspace.yaml`:

- Default `catalog:` — web/API/shared libs (`zod`, `graphql`, `drizzle-orm`, `better-auth`, web React `^19.2.x`, tooling, etc.).
- Named `catalog:mobile` — Expo/React Native **exact pins** (`react@19.2.0`, `react-native`, NativeWind, mobile Tailwind v3). Dependabot ignores these paths (`.github/dependabot.yml`); move them only with a deliberate Expo SDK upgrade. Dependabot is the only dependency bot in the template (npm, GitHub Actions SHA pins, Docker digests, the Tauri Cargo graph, Compose image tags); a downstream project that prefers Renovate can swap it in, but never run both.

Prefer `"zod": "catalog:"` (or `"react": "catalog:mobile"`) in package.json over duplicated ranges. Scaffold a package with `pnpm create:package <name>`.

```ts
import { auth } from "@repo/auth/client";
import { runMigrations } from "@repo/db/migrate";
import { todosTable } from "@repo/db/schema";
import type { TodoInsert } from "@repo/db/types";
import { useFeatureFlag } from "@repo/feature-flags";
import { Button } from "@repo/ui";
import { MobileButton } from "@repo/mobile-ui";
```

## 3. Technology Choices

| Layer           | Choice                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| Package manager | pnpm 10                                                                         |
| Orchestration   | Turborepo 2                                                                     |
| Language        | TypeScript strict mode                                                          |
| Web             | React 19, Vite 8, TanStack React Query                                          |
| Mobile          | Expo SDK 55, React Native, NativeWind                                           |
| Desktop         | Tauri v2                                                                        |
| API             | Node.js, GraphQL Yoga                                                           |
| GraphQL client  | GraphQL Code Generator, graphql-request, React Query                            |
| Database        | PostgreSQL 17, Drizzle ORM                                                      |
| Auth            | better-auth 1.7 (organization + bearer plugins, scrypt password hooks)          |
| Styling         | Tailwind CSS v4 for web/UI, NativeWind with Tailwind CSS v3 pipeline for mobile |
| Testing         | Vitest and Playwright                                                           |
| Releases        | Changesets and GitHub Actions                                                   |

Do not introduce alternate foundational libraries without explicit approval. Examples: no Prisma instead of Drizzle, no Redux instead of Zustand, no Jest instead of Vitest, no styled-components instead of token/Tailwind styling, and no axios where `fetch`, generated GraphQL hooks, or `graphql-request` already fit.

## 4. Feature-Driven File Rules

Feature files follow `{feature}.{purpose}.ts(x)`.

| Suffix           | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `.definition.ts` | constants, route paths, storage keys, enums, magic strings |
| `.type.ts`       | TypeScript types and interfaces                            |
| `.config.ts`     | feature-specific config                                    |
| `.util.ts`       | pure helpers and business logic helpers                    |
| `.adapter.ts`    | data access or integration adapters                        |
| `.schema.ts`     | GraphQL SDL/type definitions for API features              |
| `.router.ts`     | GraphQL resolvers or server route handlers                 |
| `.route.tsx`     | page/screen route component                                |
| `.validator.ts`  | Zod validators                                             |
| `.store.ts`      | Zustand store                                              |
| `.hook.ts`       | React hooks                                                |
| `.server.ts`     | server entry point or server-only logic                    |
| `.client.ts`     | client entry point or client-only logic                    |
| `.test.ts`       | Vitest tests                                               |
| `.graphql`       | GraphQL operation documents                                |

Component files use kebab-case: `todo-list.tsx`, `login-form.tsx`, `organization-switcher.tsx`.

Feature folders are lowercase kebab-case under `features/{feature}/`. Feature-specific components live in `features/{feature}/components/`. Shared app hooks live in `src/hooks/`. Shared package hooks live in the appropriate package.

## 5. Strings, Types, and Package Boundaries

- Every user-facing string must come from `packages/translation/src/locales/{lang}/{namespace}.json` and be read through the i18n helpers.
- Structural constants such as route paths, storage keys, endpoint paths, pagination defaults, and enum values belong in `.definition.ts` files.
- Keep TypeScript strict. Use `unknown` and narrow it when the value is not known.
- Drizzle schemas are the source of truth for database shapes. Derive validators and types from `@repo/db`.
- Package exports are the public API. Add exports deliberately and import through `@repo/<package>` subpaths.

## 6. Data and Auth Rules

- User-created data is organization-scoped by default. New data tables need an `organizationId` foreign key unless there is a clear system-level reason not to.
- API queries resolve the active organization from auth/session context. Do not trust client-provided organization IDs for scoped user data.
- Every resolver that accesses scoped data must authenticate the user, verify organization membership, and filter by `organizationId`.
- Auth is better-auth (organization + bearer plugins) in `@repo/auth`; see `docs/adr/0008-adopt-better-auth.md`. better-auth owns `/api/auth/*` (mounted via `toNodeHandler`); `ServerAuth` is a thin session/read facade. Sessions are database-backed; passwords are salted scrypt hashes with embedded cost parameters, preserved as better-auth's custom password hooks (see `docs/adr/0005-scrypt-password-hashing.md`).
- Cookies are primary for browser auth (`kaine.session_token`). The API also accepts `Authorization: Bearer <session-token>` for desktop, webview, and cross-origin cases where cookies are unreliable.
- The signup flow auto-creates a default personal organization so every user belongs to at least one organization.
- The auth surface also covers: organization invitations (admin-gated, accepted by the authenticated user whose email matches), password reset (`/api/auth/request-password-reset`, `/api/auth/reset-password`; resets invalidate sessions), optional soft email verification (`AUTH_REQUIRE_EMAIL_VERIFICATION`, never gates login, `emailVerified` on session users), and env-gated GitHub/Google OAuth on web.
- `API_CORS_ORIGINS` is dual-purpose: it feeds both CORS and better-auth's `trustedOrigins`. It is **required in production** (boot fails if unset/empty). A browser web origin missing from it fails sign-in with `403 INVALID_ORIGIN`, not a CORS error. Full variable list: `.env.example` and section 9 below.
- The API rate-limits `/api/auth/*` and `/graphql` (`API_RATE_LIMIT_*`, `API_TRUST_PROXY`) and exposes `/health` and `/ready` probes. Full variable list: `.env.example` and section 9 below.

## 7. Feature Flags

Feature flags are config-driven in `@repo/feature-flags`. There is no remote flag service in the template.

`ORGANIZATIONS_VISIBLE` controls whether organization UI is visible:

- When true: org switcher, members navigation, members route, and invite/member UI are visible.
- When false: org UI is hidden, but the data model and default organization behavior still exist.
- Web uses `VITE_ORGANIZATIONS_VISIBLE`; mobile uses `EXPO_PUBLIC_ORGANIZATIONS_VISIBLE`.

## 8. GraphQL Rules

- API feature SDL lives in `apps/api/src/features/{feature}/{feature}.schema.ts`.
- API resolvers live in `apps/api/src/features/{feature}/{feature}.router.ts`.
- A central GraphQL feature registry is the source for both runtime schema composition and schema generation. Add features there instead of maintaining parallel lists.
- The generated schema file `apps/api/schema.graphql` is committed.
- Client operations live in `apps/{web,mobile}/src/graphql/operations/*.graphql`.
- Generated client artifacts live in `apps/{web,mobile}/src/graphql/generated/`.
- Do not hand-edit generated GraphQL artifacts.
- Use generated React Query hooks for GraphQL data fetching.

Regenerate after GraphQL schema or operation changes. Root `pnpm generate` runs API `schema:generate` (writes `apps/api/schema.graphql`) then client codegen for web and mobile:

```bash
pnpm generate
```

CI regenerates and fails if `schema.graphql` or `apps/*/src/graphql/generated/` drift from the commit.

## 9. Runtime and Environment Rules

Server-side environment variables use plain names. Vite client variables use `VITE_`. Expo client variables use `EXPO_PUBLIC_`. Start from `.env.example` for the full commented list; this section is the engineering authority for behavior.

Important runtime variables:

| Variable                                                           | Purpose                                                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                     | Postgres connection string                                                                                             |
| `BETTER_AUTH_SECRET`                                               | auth secret (≥32 chars in production; reject placeholders)                                                             |
| `BETTER_AUTH_URL`                                                  | public auth/API base URL                                                                                               |
| `EMAIL_PROVIDER`                                                   | email adapter (`console` in dev; `resend` needs `RESEND_API_KEY`)                                                      |
| `AUTH_REQUIRE_EMAIL_VERIFICATION`                                  | soft verification flag (does not gate login; see ADR 0007)                                                             |
| `GITHUB_*` / `GOOGLE_*`                                            | optional OAuth; each provider needs both id and secret                                                                 |
| `VITE_AUTH_SOCIAL_PROVIDERS` / `EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS` | UI button gates (comma-separated)                                                                                      |
| `API_HOST`                                                         | optional API listen host, for example `0.0.0.0` for LAN testing                                                        |
| `API_PORT`                                                         | API port, default `4000`                                                                                               |
| `API_URL`                                                          | API URL for server/runtime references                                                                                  |
| `API_RUN_MIGRATIONS`                                               | optional startup migrations; defaults to true only in production                                                       |
| `API_CORS_ORIGINS`                                                 | browser/API origin allowlist; **required in production**                                                               |
| `API_GRAPHQL_MAX_DEPTH`                                            | GraphQL depth limit (default 8)                                                                                        |
| `API_GRAPHQL_MAX_COMPLEXITY`                                       | GraphQL field-selection complexity cap (default 200)                                                                   |
| `API_GRAPHQL_INTROSPECTION`                                        | force introspection; default off in production                                                                         |
| `API_RATE_LIMIT_*`                                                 | in-memory rate limit for `/api/auth/*` and `/graphql`                                                                  |
| `API_TRUST_PROXY`                                                  | set `true` only behind a trusted reverse proxy                                                                         |
| `ORGANIZATIONS_VISIBLE` / `VITE_*` / `EXPO_PUBLIC_*`               | org UI visibility flags                                                                                                |
| `AI_TODO_PROVIDER`                                                 | optional AI todo provider; must be exactly `openai` or `deepseek`, any other value fails startup; defaults to `openai` |
| `AI_TODO_MODEL`                                                    | optional model override for the selected AI todo provider                                                              |
| `AI_ASSISTANT_PROVIDER`                                            | optional assistant provider; same allowed values, falls back to `AI_TODO_PROVIDER`                                     |
| `AI_ASSISTANT_MODEL`                                               | optional model override for the assistant; falls back to `AI_TODO_MODEL` when the providers match                      |
| `OPENAI_API_KEY`                                                   | required for AI todos when `AI_TODO_PROVIDER` is `openai`                                                              |
| `DEEPSEEK_API_KEY`                                                 | required for AI todos when `AI_TODO_PROVIDER` is `deepseek`                                                            |
| `VITE_API_PROXY_TARGET`                                            | Vite dev proxy target for `/api` and `/graphql`                                                                        |
| `VITE_API_URL`                                                     | web API base URL                                                                                                       |
| `VITE_GRAPHQL_URL`                                                 | web GraphQL URL                                                                                                        |
| `EXPO_PUBLIC_API_URL`                                              | mobile API base URL                                                                                                    |
| `EXPO_PUBLIC_GRAPHQL_URL`                                          | mobile GraphQL URL                                                                                                     |
| `S3_*`                                                             | S3-compatible storage settings                                                                                         |
| `OBSERVABILITY_*` / `SENTRY_DSN` / `OTEL_*`                        | optional error-reporting seam (no traffic when disabled)                                                               |

**`API_CORS_ORIGINS` notes:** Dual-purpose (CORS + better-auth `trustedOrigins`). Missing browser origin → sign-in fails with `403 INVALID_ORIGIN` (looks like auth, not CORS). better-auth may pattern-match origins; our CORS reflection is exact-match—do not rely on wildcards. Development may omit the var (open CORS for local DX); production never does.

Auth is cookie-first (`kaine.session_token`). The API also accepts `Authorization: Bearer <session-token>` for desktop, webview, and cross-origin cases. Password reset uses better-auth routes (`/api/auth/request-password-reset`, `/api/auth/reset-password`). Production hardening checklist: `SECURITY.md`.

Postgres SSL is derived from `DATABASE_URL` query params. `sslmode=verify-ca` and `sslmode=verify-full` require certificate verification. Other enabled SSL modes use TLS without strict certificate verification, which works better for common managed database and local tunnel setups.

The API verifies database connectivity on startup. Production startup can run `runMigrations()` from `@repo/db/migrate` when `API_RUN_MIGRATIONS` resolves true.

### Mobile device testing (LAN)

On a physical phone, `localhost` is the phone, not your laptop. Use:

```bash
pnpm dev:mobile:lan
```

The command detects the laptop LAN IPv4, starts the API on `0.0.0.0`, points Expo at that host, and clears Metro's cache. Same Wi-Fi required; allow inbound port `4000` if the firewall prompts. Override with `MOBILE_LAN_IP=192.168.1.42 pnpm dev:mobile:lan` when detection is wrong. Mobile OAuth uses the `kaineforge://` deep-link scheme (`apps/mobile/app.json`); the API trusts that scheme automatically.

## 10. Docker Rules

The template includes production Dockerfiles for API and web:

- `Dockerfile.api` uses `turbo prune @repo/api --docker`, builds the API graph, fixes emitted ESM extensions, copies package dist outputs, and runs `node apps/api/dist/index.js`.
- `Dockerfile.web` uses `turbo prune @repo/web --docker`, builds the web graph, and serves the SPA through unprivileged nginx (`nginxinc/nginx-unprivileged` on port `3000`).
- `apps/web/nginx.conf` handles SPA fallback, static asset caching, `/api` proxying, `/graphql` proxying, and websocket upgrade headers. Runtime proxy target: `API_BACKEND_URL`.
- Both images define `HEALTHCHECK` directives: API probes `GET /health` (liveness; `GET /ready` checks database for readiness); web probes nginx.
- Each top-level `Dockerfile.<app>` defines a deployable app branch contract. The Release workflow on `main` runs `pnpm release:apps` after quality gates; manual CLI remains for dry-runs and repairs.
- Docker images must stay template-safe. Do not add product-specific services, assets, or secrets.

Build examples:

```bash
docker build -f Dockerfile.api -t kaine-forge-api .
docker build -f Dockerfile.web -t kaine-forge-web .
docker run --rm -p 3000:3000 -e API_BACKEND_URL=http://host.docker.internal:4000 kaine-forge-web
```

A human operator can initialize all deployable app branches intentionally with:

```bash
pnpm release:apps --apps all
```

## 11. UI and Styling Boundaries

`DESIGN_SYSTEM.md` is authoritative for visual rules. Engineering rules:

- Web and desktop use `@repo/ui`, React DOM primitives, shadcn/Radix foundations, Tailwind CSS v4, and `--ds-*` tokens.
- Mobile uses `@repo/mobile-ui`, React Native primitives, NativeWind, and mobile-compatible token utilities.
- Do not import `@repo/ui` into React Native runtime code.
- Do not import `@repo/mobile-ui` into web/desktop runtime code.
- App feature components can import UI packages, translations, auth, feature flags, query helpers, generated GraphQL hooks, and shared validators/types.
- Shared UI primitives must be data-agnostic and receive labels/content through props.
- Do not hardcode visual values in components. Use semantic token utilities.

## 12. Application Shell

Web/desktop shell:

- Header: stable sidebar trigger and route breadcrumbs.
- Sidebar: optional Organization switcher above dashboard, todos, notes, assistant, and members navigation. Organization controls and members are gated by `ORGANIZATIONS_VISIBLE`.
- Language, theme, and user controls sit below navigation. Preferences stack in the collapsed icon rail. Below 768px, navigation uses a drawer.
- Main content renders the active route, keyed by Active Organization. Theme and language changes preserve route drafts; successful Organization switches reset scoped route state.

Mobile shell:

- Expo Router owns file-based routing.
- Drawer navigation replaces the web sidebar.
- The drawer holds explicit theme/language choices and logout. Organization switching is above navigation when enabled; native Todo state resets on Active Organization changes.
- Mobile screens reuse shared auth/data/translation packages and `@repo/mobile-ui` primitives.

## 13. State Management

- Zustand is for client UI state such as sidebar, theme, and local app preferences.
- React Query is for server state. Do not duplicate server data in Zustand.
- Web/desktop persistence uses localStorage.
- Mobile persistence uses the mobile storage adapter chosen by the app.

Provider order:

```tsx
<TranslationProvider>
  <ThemeProvider>
    <QueryProvider>
      <AuthProvider>
        <OrganizationProvider>{children}</OrganizationProvider>
      </AuthProvider>
    </QueryProvider>
  </ThemeProvider>
</TranslationProvider>
```

## 14. Desktop Rules

- Tauri v2 is the desktop shell. Do not switch to Electron without an ADR-level decision.
- The frontend is the web app built by Vite.
- Keep Tauri capabilities least-privilege.
- Desktop-specific UI should be feature-detected and should degrade safely in browser mode.

## 15. Mobile Rules

- Expo Router file routes live in `apps/mobile/app`.
- Feature code lives under `apps/mobile/src/features/{feature}` using the same FDD naming style as web/API.
- `@repo/mobile-ui` owns reusable React Native primitives and variants.
- `apps/mobile/src/styles/global.css` holds NativeWind-compatible token CSS generated from `packages/ui/src/styles/globals.css` via `pnpm tokens:mobile` (see DESIGN*SYSTEM.md §10). Do not hand-edit the `DESIGN_TOKENS*\*` region.
- Mobile can share auth, db types/validators, feature flags, query helpers, translations, and GraphQL operations, but not React DOM components.

## 16. Script Standards

Every workspace should expose the standard scripts when meaningful:

```text
dev, build, check, format, format:check, lint, lint:fix, typecheck, test, clean
```

Root commands:

| Command               | Purpose                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev`            | run web + API dev servers (default); `dev:web` / `dev:api` / `dev:mobile` / `dev:all` for other scopes      |
| `pnpm bootstrap`      | env, install, AI files, build (every workspace except `@repo/desktop`), db seed (no dev server)             |
| `pnpm initialize`     | `bootstrap` then `dev`                                                                                      |
| `pnpm build`          | build all workspaces                                                                                        |
| `pnpm build:core`     | build API and web dependency graph                                                                          |
| `pnpm check`          | format check, lint, boundaries, typecheck, test, knip                                                       |
| `pnpm coverage`       | Vitest coverage: global floors plus per-package floors for `@repo/auth`, `@repo/api`, and `@repo/mobile-ui` |
| `pnpm test:e2e`       | Playwright web/API suite                                                                                    |
| `pnpm generate`       | GraphQL codegen                                                                                             |
| `pnpm create:feature` | scaffold an organization-scoped feature slice (API + web) and wire it in                                    |
| `pnpm create:package` | scaffold a new `@repo/*` package                                                                            |
| `pnpm db:*`           | database lifecycle commands                                                                                 |
| `pnpm ai:install`     | install shared assistant files locally                                                                      |
| `pnpm ai:doctor`      | lint canonical AI files and report drift                                                                    |
| `pnpm graph`          | build the Graphify knowledge graph (optional CLI)                                                           |
| `pnpm graph:update`   | refresh the knowledge graph incrementally                                                                   |

Use scoped commands from the repo root:

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/web typecheck
pnpm --filter @repo/mobile-ui typecheck
```

## 17. Quality Gates

- Pre-commit runs lint-staged with Prettier and ESLint fixes on staged files.
- Pre-push runs `pnpm ai:doctor` and **affected** `turbo run typecheck` against the upstream merge-base (full typecheck if no upstream).
- PR CI runs AI drift check, then Turbo **affected** format/lint/typecheck/test (`--filter=...[origin/<base>]`), coverage, core build, and e2e. Mobile typecheck and Mobile Export Validation run when mobile paths change; Deep Checks keeps the scheduled mobile export and desktop checks (ADR 0003).
- Optional remote Turbo cache: repository secret `TURBO_TOKEN` and variable `TURBO_TEAM` (Vercel Remote Cache or compatible).
- Source changes in `apps/**`, `packages/**`, or `tooling/**` need a Changesets file unless labeled `release:skip-changeset`.
- After deployable app changes land on `main`, the Release workflow updates affected `release/<app>` branches. Manual repair commands are human-only.

Before finishing a substantial task, run the narrowest useful workspace checks plus the relevant root gates.

## 18. AI Assistant Scaffold

`.ai/` is canonical. Installed assistant files should not be edited directly.

Canonical sources:

- `.ai/guide.md`
- `.ai/skills/*.md`
- `.ai/mcp.json`
- `.ai/cursor-rules.md`
- `.ai/review.md`
- `.ai/serena-project.yml`
- `.ai/serena-memories/*.md`

Tracked shared outputs:

- `AGENTS.md`
- `CLAUDE.md`
- `REVIEW.md`
- `.serena/memories/*.md`
- `.claude/settings.json`
- `.claude/README.md`

Shared review contract `REVIEW.md` (from `.ai/review.md`); promote recurring failures with `kaine-encode-knowledge` (ADR 0009).

Local gitignored outputs:

- `.claude/skills/<skill>/SKILL.md`
- `.agents/skills/<skill>/SKILL.md`
- `.cursor/skills/<skill>/SKILL.md`
- `.cursor/rules/kaine-rules.mdc`
- `.grok/skills/<skill>/SKILL.md`
- `.grok/hooks/kaine-session-start.json`
- `.grok/agents/<name>.md`
- `.mcp.json`
- `.cursor/mcp.json`
- `.codex/config.toml`
- `.grok/config.toml`
- `opencode.json`

MCP config must use placeholders only. Do not commit secrets, `.ai.local/`, or org-specific services in the template. Downstream projects can add tool-specific skills or MCP servers in their own `.ai/` sources.

Graphify is optional per-developer tooling: `pnpm graph` writes a queryable codebase knowledge graph to `graphify-out/`, which is local, gitignored, and dockerignored. The `kaine-graph` skill documents install, build, and query workflows, and the shared MCP catalog carries an opt-in `graphify` server. Keep Graphify out of `pnpm initialize`, husky hooks, and CI, and never run Graphify's per-project installers, which write into generated files such as `AGENTS.md` and `CLAUDE.md`.

## 19. Adding a Feature

Pick the reference feature that matches your scope: clone `notes` for a plain organization-scoped CRUD slice (API + web), and `todos` only when you need its full stack (AI generation, attachments, subscriptions) including mobile.

**Platform default:** API + web. Mobile is a **subset** of the template product surface — see `CONTEXT.md` **Template platform surfaces**. Do not add mobile GraphQL operations or screens unless the task requires mobile or you are extending the mobile-supported set (auth, dashboard, todos).

```bash
pnpm create:feature <singular> --plural <plural> --write
```

That emits the whole `notes`-shaped slice — Drizzle table, API feature, web list and detail routes, all three locale files, an e2e spec, and a changeset — wires the 11 registration points, then runs `pnpm generate`. Preview it without `--write` first. Columns start as placeholder `title` and `body`; edit them, then run `pnpm db:generate`. Translate the generated German and Serbian copy, including navigation labels, before `pnpm check`: locale tests reject values identical to English unless the locale/key has an explicit shared-term exception. The generator never writes `pnpm db:push:local` or a migration for you.

Do the steps below by hand only when the generator does not fit — a feature that is not organization-scoped CRUD, or one that needs mobile.

1. Add Drizzle schema, validators, and inferred types in `packages/db`.
2. Add translation namespace entries for each supported language.
3. Add API schema, resolver, adapter, constants, and tests under `apps/api/src/features/{feature}`.
4. Register the API feature in the central GraphQL feature registry. `apps/api/src/schema/features.test.ts` asserts the registered feature names — add the new feature there or the API test suite fails by design.
5. Add web GraphQL operations, then run `pnpm generate`. Add mobile operations only when mobile is in scope for this feature.
6. Add web route/component code under `apps/web/src/features/{feature}`.
7. When mobile is in scope: add mobile route/screen code under `apps/mobile/src/features/{feature}` and matching operations.
8. Add tests at the nearest useful layer and e2e coverage for user-visible web/API flows (mobile e2e is not required by the template default).
9. Add a changeset for releasable source changes.

Organization-scoped client query keys come from `createActiveOrganizationQueryKey` in `@repo/query`.

## 20. Common Mistakes to Avoid

| Mistake                                               | Correct approach                                         |
| ----------------------------------------------------- | -------------------------------------------------------- |
| Hardcoding user-facing strings                        | Add translation keys and use i18n helpers                |
| Using `any`                                           | Use a real type or `unknown` with narrowing              |
| Importing package internals                           | Import through `@repo/*` exports                         |
| Passing `organizationId` from clients for scoped data | Resolve active organization from session/context         |
| Editing generated GraphQL files                       | Edit SDL/operations and run `pnpm generate`              |
| Editing assistant guidance or skills                  | Edit `.ai/` and run `pnpm ai:install` + `pnpm ai:doctor` |
| Using raw colors or spacing in UI                     | Use design-system tokens                                 |
| Importing web UI into mobile                          | Use `@repo/mobile-ui`                                    |
| Adding org-specific tools to the template             | Keep them downstream in project-specific `.ai/` sources  |

## 21. Reference Docs

- `DESIGN_SYSTEM.md`: visual language and tokens.
- `README.md`: short landing page (pitch, compare, quickstart, doc map).
- `CONTRIBUTING.md`: contribution workflow.
- `SECURITY.md`: security reporting and hardening.
- `docs/README.md`: documentation index.
- `docs/adr/`: accepted architecture decisions.

## 22. Local database and release commands

Local bootstrap and end-to-end preparation require `ALLOW_LOCAL_DB_PUSH=true` in the untracked `.env`. The template defaults to false. `pnpm db:prepare:local` validates the target, creates the database if needed, pushes the schema, and seeds local fixtures. `pnpm db:push:local` only pushes the schema. Both accept PostgreSQL on `localhost`, `127.0.0.1`, or `::1`; they reject production mode, system databases, URL query overrides, and extra arguments. Destructive Drizzle prompts are not automatically accepted. Shared and deployed databases use reviewed migrations. Existing `.env` files and database contents are not reset by setup.

The Release workflow owns deployment branch updates. Manual `pnpm release:apps` commands, including `--dry-run`, are human operations and remain blocked for agents.
