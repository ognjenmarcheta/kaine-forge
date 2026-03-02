# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Authoritative References

Read before generating, modifying, or reviewing code:

- `MONOREPO_GUIDE.md` — Architecture, conventions, naming patterns, constraints (single source of truth)
- `DESIGN_SYSTEM.md` — Design tokens, color roles, spacing, typography, component behavior
- `AGENTS.md` — Priority and conflict resolution between the two

## Common Commands

```bash
# Bootstrap (one command)
pnpm initialize

# Manual setup
cp .env.example .env && docker compose up -d && pnpm install
pnpm db:generate && pnpm db:ensure && pnpm db:push && pnpm db:seed

# Development
pnpm dev                          # all apps in parallel
pnpm --filter @repo/web dev       # single workspace
pnpm --filter @repo/api dev       # API only

# Quality gates (run before PR)
pnpm check                        # format:check + lint + typecheck + test
pnpm build:core                   # build API + Web
pnpm test:e2e                     # Playwright (seeds DB, spins isolated servers)

# Single workspace check
pnpm --filter <workspace> check

# Testing
pnpm test                         # all unit/integration tests (Vitest)
pnpm --filter @repo/api test      # single workspace tests
pnpm coverage                     # monorepo coverage with thresholds

# Linting & formatting
pnpm lint                         # ESLint (flat config v9)
pnpm lint:fix                     # autofix
pnpm format                       # Prettier write
pnpm format:check                 # Prettier check only
pnpm typecheck                    # tsc --noEmit across workspaces

# Database (Drizzle + PostgreSQL 17)
pnpm db:generate                  # generate migrations
pnpm db:push                      # push schema to local DB
pnpm db:migrate                   # apply migrations
pnpm db:seed                      # seed test data (test@test.test / ChangeMe123!)
pnpm db:studio                    # Drizzle Studio GUI

# GraphQL codegen
pnpm generate

# Releases
pnpm changeset                    # add release metadata
pnpm release:status               # inspect pending changes
```

## Architecture

**Turborepo + pnpm monorepo** with Feature-Driven Development (FDD).

### Apps

| App            | Stack                                        | Port      |
| -------------- | -------------------------------------------- | --------- |
| `apps/api`     | GraphQL Yoga + Node.js                       | 4000      |
| `apps/web`     | React 19 + Vite                              | 3000      |
| `apps/desktop` | Tauri v2 (Rust backend, serves web frontend) | —         |
| `apps/mobile`  | Expo / React Native                          | —         |
| `apps/e2e`     | Playwright test suite                        | 3010/4010 |

### Shared Packages (`@repo/*` scope)

| Package               | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `@repo/db`            | Drizzle schemas, types (drizzle-zod), validators, migrations  |
| `@repo/auth`          | better-auth server/client with organization plugin            |
| `@repo/ui`            | shadcn/ui primitives + composed components (web/desktop only) |
| `@repo/translation`   | i18next + locale JSON files                                   |
| `@repo/feature-flags` | Config-driven feature toggles                                 |
| `@repo/query`         | GraphQL client utilities                                      |
| `@repo/storage`       | S3-compatible file storage with presigned URLs                |
| `@repo/config`        | ESLint, Prettier, Tailwind, TypeScript shared configs         |

### Data Flow

```
Web/Mobile/Desktop → GraphQL (urql/graphql-request)
                   → GraphQL Yoga (apps/api)
                   → Drizzle ORM (packages/db)
                   → PostgreSQL 17
```

### Multi-Tenancy

All data is organization-scoped. Every data table has `organizationId` FK. The API extracts `activeOrganizationId` from the better-auth session and scopes all queries. Users get a "Personal" org on signup.

## Key Conventions

### File Naming (FDD)

Files follow `{feature-name}.{purpose}.{ext}`:
`.type.ts`, `.util.ts`, `.adapter.ts`, `.router.ts`, `.route.tsx`, `.config.ts`, `.definition.ts`, `.validator.ts`, `.store.ts`, `.test.ts`, `.graphql`

React components use kebab-case: `todo-list.tsx`, `login-form.tsx`.

### Where Things Go

| Need                 | Location                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| DB table             | `packages/db/src/schema/{name}.schema.ts`                                   |
| Zod validator        | `packages/db/src/validators/{name}.validator.ts`                            |
| Inferred types       | `packages/db/src/types/{name}.type.ts`                                      |
| API resolver         | `apps/api/src/features/{name}/{name}.router.ts`                             |
| API DB queries       | `apps/api/src/features/{name}/{name}.adapter.ts`                            |
| GraphQL ops (client) | `apps/{web,mobile}/src/graphql/operations/{name}.graphql`                   |
| Client data hooks    | `apps/{web,mobile}/src/features/{name}/{name}.adapter.ts`                   |
| Page component       | `apps/{web,mobile}/src/features/{name}/{name}.route.tsx`                    |
| Feature component    | `apps/{web,mobile}/src/features/{name}/components/`                         |
| Shared UI component  | `packages/ui/src/components/primitives/` or `composed/`                     |
| Zustand store        | `apps/{web,mobile}/src/stores/{name}.store.ts`                              |
| Translations         | `packages/translation/src/locales/{lang}/{namespace}.json`                  |
| Feature flag         | `packages/feature-flags/src/flags.definition.ts` + `flags.config.ts`        |
| Storage schema       | `packages/db/src/schema/files.schema.ts`                                    |
| Storage resolvers    | `apps/api/src/features/storage/`                                            |
| Storage ops          | `apps/{web,mobile}/src/graphql/operations/storage.graphql`                  |
| Upload hook          | `apps/{web,mobile}/src/hooks/use-file-upload.ts`                            |
| Design token         | `packages/ui/src/styles/globals.css` + `packages/config/tailwind/preset.js` |

### Hard Rules

- **No `any`** — use `unknown` and narrow. Exception: generated code only.
- **No hardcoded user-facing strings** — all go through `t()` / `useTranslation()`.
- **No hardcoded colors/spacing** — use `--ds-*` tokens via Tailwind utility classes.
- **No alternative libraries** for anything in the tech stack (no axios, styled-components, Redux, Prisma, Jest).
- **Import through package exports only** — `@repo/db/schema`, not internal paths.
- **Schema-derived types** — Drizzle schemas are the source of truth; types/validators derived via drizzle-zod.
- **UI component tiers** — Primitives (data-agnostic, prop-driven), Composed (prop-driven, no stores), Feature (can use stores, translation, auth).
- **Server data in urql cache, UI state in Zustand** — don't duplicate server state.

### Commit Style

Conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`, `docs(scope):`

Source changes (`apps/**`, `packages/**`, `tooling/**`) require `pnpm changeset` or the `release:skip-changeset` PR label.

## Environment Variables

Server-side: plain names (`DATABASE_URL`, `API_PORT`). Vite client: `VITE_` prefix. Expo client: `EXPO_PUBLIC_` prefix. See `.env.example` for all values.

## TypeScript Config

Strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`. Target: ES2022, module resolution: Bundler.
