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
- Data model: organization-scoped by default through better-auth organizations.
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
    auth/          better-auth server/client helpers and organization logic
    config/        ESLint, TypeScript, Prettier, and Tailwind configuration
    db/            Drizzle schema, validators, migrations, seed, migrate export
    feature-flags/ config-driven feature flags
    logger/        shared logger setup
    mobile-ui/     React Native primitives and NativeWind variants
    query/         shared React Query keys and cache helpers
    storage/       S3-compatible storage helpers
    translation/   i18next config and locale files
    ui/            React DOM design-system primitives and composed UI
  tooling/
    graphql-codegen/ GraphQL Code Generator config
```

All internal packages use the `@repo/*` scope. Import through package exports only, never through internal source paths.

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
| Web             | React 19, Vite 7, TanStack React Query                                          |
| Mobile          | Expo SDK 54, React Native, NativeWind                                           |
| Desktop         | Tauri v2                                                                        |
| API             | Node.js, GraphQL Yoga                                                           |
| GraphQL client  | GraphQL Code Generator, graphql-request, React Query                            |
| Database        | PostgreSQL 17, Drizzle ORM                                                      |
| Auth            | better-auth with organizations                                                  |
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
- better-auth is the auth provider. Sessions are database-backed.
- Cookies are primary for browser auth. The API also supports `Authorization: Bearer <session-token>` for desktop, webview, and cross-origin cases where cookies are unreliable.
- Auth API routes live under `/api/auth/*`.
- The signup flow auto-creates a default personal organization so every user belongs to at least one organization.

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

Regenerate after GraphQL schema or operation changes:

```bash
pnpm generate
```

## 9. Runtime and Environment Rules

Server-side environment variables use plain names. Vite client variables use `VITE_`. Expo client variables use `EXPO_PUBLIC_`.

Important runtime variables:

| Variable                  | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`            | Postgres connection string                                       |
| `BETTER_AUTH_SECRET`      | auth secret                                                      |
| `BETTER_AUTH_URL`         | public auth/API base URL                                         |
| `API_PORT`                | API port, default `4000`                                         |
| `API_URL`                 | API URL for server/runtime references                            |
| `API_RUN_MIGRATIONS`      | optional startup migrations; defaults to true only in production |
| `API_CORS_ORIGINS`        | comma-separated browser/API origin allowlist                     |
| `API_GRAPHQL_MAX_DEPTH`   | GraphQL depth limit                                              |
| `VITE_API_PROXY_TARGET`   | Vite dev proxy target for `/api` and `/graphql`                  |
| `VITE_API_URL`            | web API base URL                                                 |
| `VITE_GRAPHQL_URL`        | web GraphQL URL                                                  |
| `EXPO_PUBLIC_API_URL`     | mobile API base URL                                              |
| `EXPO_PUBLIC_GRAPHQL_URL` | mobile GraphQL URL                                               |
| `S3_*`                    | S3-compatible storage settings                                   |

Postgres SSL is derived from `DATABASE_URL` query params. `sslmode=verify-ca` and `sslmode=verify-full` require certificate verification. Other enabled SSL modes use TLS without strict certificate verification, which works better for common managed database and local tunnel setups.

The API verifies database connectivity on startup. Production startup can run `runMigrations()` from `@repo/db/migrate` when `API_RUN_MIGRATIONS` resolves true.

## 10. Docker Rules

The template includes production Dockerfiles for API and web:

- `Dockerfile.api` uses `turbo prune @repo/api --docker`, builds the API graph, fixes emitted ESM extensions, copies package dist outputs, and runs `node apps/api/dist/index.js`.
- `Dockerfile.web` uses `turbo prune @repo/web --docker`, builds the web graph, and serves the SPA through nginx.
- `apps/web/nginx.conf` handles SPA fallback, static asset caching, `/api` proxying, `/graphql` proxying, and websocket upgrade headers.
- Docker images must stay template-safe. Do not add product-specific services, assets, or secrets.

Build examples:

```bash
docker build -f Dockerfile.api -t kaine-forge-api .
docker build -f Dockerfile.web -t kaine-forge-web .
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

- Header: logo, optional org switcher, language switcher, theme control, user menu.
- Sidebar: dashboard, todos, and members when `ORGANIZATIONS_VISIBLE` is enabled.
- Main content renders the active route.

Mobile shell:

- Expo Router owns file-based routing.
- Drawer navigation replaces the web sidebar.
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
- `apps/mobile/src/styles/global.css` defines NativeWind-compatible token utilities for the mobile runtime.
- Mobile can share auth, db types/validators, feature flags, query helpers, translations, and GraphQL operations, but not React DOM components.

## 16. Script Standards

Every workspace should expose the standard scripts when meaningful:

```text
dev, build, check, format, format:check, lint, lint:fix, typecheck, test, clean
```

Root commands:

| Command           | Purpose                                  |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | run dev tasks                            |
| `pnpm build`      | build all workspaces                     |
| `pnpm build:core` | build API and web dependency graph       |
| `pnpm check`      | format check, lint, typecheck, test      |
| `pnpm coverage`   | Vitest coverage thresholds               |
| `pnpm test:e2e`   | Playwright web/API suite                 |
| `pnpm generate`   | GraphQL codegen                          |
| `pnpm db:*`       | database lifecycle commands              |
| `pnpm ai:install` | install shared assistant files locally   |
| `pnpm ai:doctor`  | lint canonical AI files and report drift |

Use scoped commands from the repo root:

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/web typecheck
pnpm --filter @repo/mobile-ui typecheck
```

## 17. Quality Gates

- Pre-commit runs lint-staged with Prettier and ESLint fixes on staged files.
- Pre-push runs `pnpm ai:doctor` and `pnpm typecheck`.
- PR CI runs AI drift check, format check, lint, typecheck, tests, coverage, core build, and e2e.
- Source changes in `apps/**`, `packages/**`, or `tooling/**` need a Changesets file unless labeled `release:skip-changeset`.

Before finishing a substantial task, run the narrowest useful workspace checks plus the relevant root gates.

## 18. AI Assistant Scaffold

`.ai/` is canonical. Installed assistant files should not be edited directly.

Canonical sources:

- `.ai/guide.md`
- `.ai/skills/*.md`
- `.ai/mcp.json`
- `.ai/cursor-rules.md`
- `.ai/serena-project.yml`
- `.ai/serena-memories/*.md`

Tracked shared outputs:

- `AGENTS.md`
- `CLAUDE.md`
- `.serena/project.yml`
- `.serena/memories/*.md`

Local gitignored outputs:

- `.claude/skills/<skill>/SKILL.md`
- `.agents/skills/<skill>/SKILL.md`
- `.cursor/skills/<skill>/SKILL.md`
- `.cursor/rules/kaine-rules.mdc`
- `.mcp.json`
- `.cursor/mcp.json`
- `.codex/config.toml`
- `opencode.json`

MCP config must use placeholders only. Do not commit secrets, `.ai.local/`, or org-specific services in the template. Downstream projects can add tool-specific skills or MCP servers in their own `.ai/` sources.

## 19. Adding a Feature

1. Add Drizzle schema, validators, and inferred types in `packages/db`.
2. Add translation namespace entries for each supported language.
3. Add API schema, resolver, adapter, constants, and tests under `apps/api/src/features/{feature}`.
4. Register the API feature in the central GraphQL feature registry.
5. Add web and mobile GraphQL operations, then run `pnpm generate`.
6. Add web route/component code under `apps/web/src/features/{feature}`.
7. Add mobile route/screen code under `apps/mobile/src/features/{feature}`.
8. Add tests at the nearest useful layer and e2e coverage for user-visible flows.
9. Add a changeset for releasable source changes.

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
- `README.md`: quickstart and template adoption.
- `CONTRIBUTING.md`: contribution workflow.
- `SECURITY.md`: security reporting and hardening.
- `docs/README.md`: documentation index.
- `docs/adr/`: accepted architecture decisions.
