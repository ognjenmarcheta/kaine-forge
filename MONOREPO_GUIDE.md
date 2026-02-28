# Monorepo AI Guide — Rules, Conventions & Architecture

> **Purpose:** This document is the single source of truth for any AI agent (or developer) working in this monorepo. It defines every rule, convention, naming pattern, architecture decision, and constraint. Follow it exactly when generating, modifying, or reviewing code.
>
> **Companion documents:**
>
> - `MONOREPO_PLAN.md` — Full architecture blueprint
> - `DESIGN_SYSTEM.md` — Design token specification & visual language

> **Scope note:** Unless explicitly marked as future/optional, every rule in this guide describes current implemented behavior in this repository.

---

## 1. Project Identity

**Type:** Turborepo + pnpm monorepo
**Architecture:** Feature-Driven Development (FDD)
**Multi-tenancy:** Organization-scoped data via better-auth organization plugin
**Language:** TypeScript everywhere (strict mode, zero `any` except generated code)
**Platforms:** Web (React + Vite), Desktop (Tauri v2), Mobile (Expo / React Native)

---

## 2. Workspace Topology

```
turbo-monorepo/
├── apps/
│   ├── web/            # React 19 + Vite SPA
│   ├── api/            # Node.js + GraphQL Yoga server
│   ├── desktop/        # Tauri v2 (Rust backend, web frontend)
│   ├── mobile/         # Expo / React Native
│   └── e2e/            # Playwright end-to-end tests
├── packages/
│   ├── auth/           # better-auth (server + client, org plugin)
│   ├── config/         # ESLint, TS, Prettier, Tailwind configs
│   ├── db/             # Drizzle schemas, migrations, seed
│   ├── feature-flags/  # Config-driven feature toggles
│   ├── query/          # Shared React Query keys + cache helpers
│   ├── translation/    # i18next + locale JSON files
│   └── ui/             # Design system: shadcn/ui + Atlassian-inspired tokens
├── tooling/
│   └── graphql-codegen/ # GraphQL Code Generator config
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

All internal packages use the **`@repo/`** scope prefix. Import examples:

```ts
import { auth } from "@repo/auth/client";
import { todosTable } from "@repo/db/schema";
import { TodoInsert } from "@repo/db/types";
import { useFeatureFlag } from "@repo/feature-flags";
import { useTranslation } from "@repo/translation";
import { Button, Sidebar, OrganizationSwitcher } from "@repo/ui";
```

---

## 3. Technology Stack — Exact Choices

| Layer            | Technology                                             | Version Target                 |
| ---------------- | ------------------------------------------------------ | ------------------------------ |
| Monorepo         | Turborepo + pnpm workspaces                            | Turborepo ^2.x, pnpm ^10.x     |
| Language         | TypeScript (strict mode everywhere)                    | ^5.7+                          |
| Frontend         | React                                                  | ^19.x                          |
| Bundler          | Vite                                                   | ^7.x                           |
| Styling (Web/UI) | Tailwind CSS v4 + shadcn/ui                            | Tailwind ^4.x                  |
| Styling (Mobile) | NativeWind + Tailwind CSS v3 compatibility             | NativeWind ^4.x, Tailwind ^3.x |
| Design system    | Custom, Atlassian-inspired with `--ds-*` tokens        | See DESIGN_SYSTEM.md           |
| State management | Zustand                                                | ^5.x                           |
| API runtime      | Node.js                                                | >= 20                          |
| GraphQL server   | GraphQL Yoga                                           | ^5.x                           |
| GraphQL client   | TanStack React Query + graphql-request                 | React Query ^5.x               |
| GraphQL codegen  | GraphQL Code Generator                                 | ^5.x                           |
| ORM              | Drizzle ORM                                            | ^0.38+                         |
| Database         | PostgreSQL                                             | 17                             |
| Auth             | better-auth                                            | ^1.x                           |
| Multi-tenancy    | better-auth organization plugin                        | (part of better-auth)          |
| Feature toggling | Custom `@repo/feature-flags` (config-driven)           | —                              |
| i18n             | i18next + react-i18next                                | i18next ^24.x                  |
| Desktop          | Tauri v2 (Rust backend)                                | ^2.x                           |
| Mobile           | React Native via Expo (SDK 54)                         | Expo ^54.x                     |
| Code quality     | ESLint v9 (flat config), Prettier, Husky + lint-staged | ESLint ^9.x, Prettier ^3.x     |
| Testing          | Vitest (unit/integration), Playwright (e2e)            | Vitest ^3.x                    |

**Do not introduce alternative libraries** for any of the above without explicit approval. For example: no axios (use generated React Query hooks + `graphql-request` for GraphQL, `fetch` for REST), no styled-components (use Tailwind + tokens), no Redux (use Zustand), no Prisma (use Drizzle), no Jest (use Vitest).

---

## 4. File Naming Conventions (FDD)

### 4.1 — Feature File Pattern

Every file in a feature module follows: `{feature-name}.{purpose}.{ext}`

| Suffix           | Purpose                                                                      | Example                 |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------- |
| `.type.ts`       | TypeScript interfaces, types, enums                                          | `todos.type.ts`         |
| `.util.ts`       | Pure utility/helper functions                                                | `todos.util.ts`         |
| `.adapter.ts`    | Data layer (DB queries on API, client-side integration helpers when needed)  | `todos.adapter.ts`      |
| `.router.ts`     | Server-side GraphQL resolvers/route handlers                                 | `todos.router.ts`       |
| `.schema.ts`     | GraphQL SDL/type definitions for API features                                | `todos.schema.ts`       |
| `.route.tsx`     | Client-side page/route component                                             | `todos.route.tsx`       |
| `.config.ts`     | Feature-specific configuration values                                        | `todos.config.ts`       |
| `.definition.ts` | Constants, enums, magic strings — the ONE allowed place for hardcoded values | `todos.definition.ts`   |
| `.validator.ts`  | Zod schemas and validation logic                                             | `todos.validator.ts`    |
| `.store.ts`      | Zustand store                                                                | `sidebar.store.ts`      |
| `.test.ts`       | Unit/integration tests                                                       | `todos.adapter.test.ts` |
| `.graphql`       | GraphQL operation documents                                                  | `todos.graphql`         |

### 4.2 — Component File Naming

React components use **kebab-case** filenames: `todo-list.tsx`, `login-form.tsx`, `organization-switcher.tsx`.

### 4.3 — Directory Rules

- Feature folders: always **lowercase kebab-case** → `features/todos/`, `features/auth/`.
- Feature-specific React components: inside a `components/` subfolder within the feature.
- Shared hooks: `hooks/` at the app level or in `packages/ui/src/hooks/`.
- Generated code: `generated/` folders.
- Constants, route paths, storage keys, pagination defaults go in `.definition.ts` files:

```ts
// todos.definition.ts
export const TODOS_DEFINITIONS = {
  ROUTES: { LIST: "/todos", DETAIL: "/todos/:id" },
  PAGINATION: { DEFAULT_PAGE_SIZE: 20, MAX_PAGE_SIZE: 100 },
  STORAGE_KEYS: { FILTER: "todos_filter" }
} as const;
```

### 4.4 — What Goes Where

| You need to...                      | Put it in...                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Define a database table             | `packages/db/src/schema/{name}.schema.ts`                                            |
| Create a Zod validator              | `packages/db/src/validators/{name}.validator.ts`                                     |
| Infer TypeScript types from schema  | `packages/db/src/types/{name}.type.ts`                                               |
| Write a GraphQL resolver            | `apps/api/src/features/{name}/{name}.router.ts`                                      |
| Write database queries (API side)   | `apps/api/src/features/{name}/{name}.adapter.ts`                                     |
| Define a GraphQL operation (client) | `apps/{web,mobile}/src/graphql/operations/{name}.graphql`                            |
| Generate GraphQL typed docs/hooks   | `apps/{web,mobile}/src/graphql/generated/` (includes `react-query.ts`)               |
| Define GraphQL fetcher helper       | `apps/{web,mobile}/src/lib/graphql-codegen-fetcher.ts`                               |
| Add shared query keys/cache helpers | `packages/query/src/`                                                                |
| Build a page/screen                 | `apps/{web,mobile}/src/features/{name}/{name}.route.tsx`                             |
| Build a shared UI component         | `packages/ui/src/components/primitives/` or `composed/`                              |
| Add a feature-specific component    | `apps/{web,mobile}/src/features/{name}/components/`                                  |
| Create a Zustand store              | `apps/{web,mobile}/src/stores/{name}.store.ts`                                       |
| Add a translation namespace         | `packages/translation/src/locales/{lang}/{namespace}.json`                           |
| Define a feature flag               | `packages/feature-flags/src/feature-flags.definition.ts` + `feature-flags.config.ts` |
| Add shared auth logic               | `packages/auth/src/`                                                                 |
| Add a design token                  | `packages/ui/src/styles/globals.css` + `packages/config/tailwind/preset.js`          |

---

## 5. String Handling Rules

### 5.1 — Zero Hardcoded User-Facing Strings

**Every string displayed to a user** must:

1. Exist as a key in a translation JSON file under `packages/translation/src/locales/{lang}/{namespace}.json`.
2. Be accessed via the `t()` function or `useTranslation()` hook.

**No exceptions.** This applies to button labels, form placeholders, error messages, page titles, empty states, tooltip text, confirmation dialogs — everything visible.

### 5.2 — Translation Namespaces

| Namespace       | Content                                             |
| --------------- | --------------------------------------------------- |
| `common`        | Shared buttons, labels, errors, validation messages |
| `auth`          | Login, signup, logout strings                       |
| `navigation`    | Sidebar items, header labels                        |
| `dashboard`     | Dashboard page strings                              |
| `todos`         | Todos feature strings                               |
| `organizations` | Organization management strings                     |

When adding a new feature, create a new namespace: `packages/translation/src/locales/en/{feature}.json`.

### 5.3 — Non-Translatable Constants

API endpoints, config keys, storage keys, route paths go in `.definition.ts` files. These are **not** translated — they are structural constants.

---

## 6. TypeScript Rules

### 6.1 — Strict Mode

The `tsconfig.base.json` enforces:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "moduleResolution": "bundler",
  "target": "ES2022",
  "module": "ES2022"
}
```

### 6.2 — No `any`

Never use `any`. Use `unknown` when the type is truly unknown and narrow it. The only exception is auto-generated code (e.g., GraphQL codegen output).

### 6.3 — Schema-Derived Types

Drizzle schemas in `@repo/db` are the single source of truth. Types and Zod validators are derived from them using `drizzle-zod`. Never duplicate type definitions — import from `@repo/db/types` and `@repo/db/validators`.

### 6.4 — Package Exports

Every package uses a `package.json` `exports` map with subpath exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./types": "./src/types/index.ts",
    "./client": "./src/client.ts",
    "./server": "./src/server.ts"
  }
}
```

Never import from internal file paths. Always import through the exported subpaths: `@repo/db/schema`, `@repo/auth/client`, etc.

---

## 7. Data Architecture Rules

### 7.1 — Organization-Scoped Data

**All user-created data is scoped per organization.** Every data entity (todos, future features) must have an `organizationId` foreign key. Queries always filter by the user's active organization.

```ts
// Every data table follows this pattern
export const todosTable = pgTable("todos", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  organizationId: text("organization_id")
    .references(() => organizationsTable.id)
    .notNull(),
  userId: uuid("user_id")
    .references(() => usersTable.id)
    .notNull()
  // ...
});
```

### 7.2 — Active Organization from Session

The user's active organization is stored in the better-auth session. The API context extracts `activeOrganizationId` from the session. All data queries filter by this value.

### 7.3 — Organization Auto-Creation

On signup, a `afterSignUp` hook automatically creates a "Personal" organization and sets the user as owner. Every user always belongs to at least one organization.

### 7.4 — Access Control

Three built-in roles: **owner** (full control), **admin** (manage members/invitations), **member** (read-only on org resources). Roles are defined in `packages/auth/src/permissions.ts` using `createAccessControl`.

### 7.5 — Feature Flag: `ORGANIZATIONS_VISIBLE`

When `false`, the organization switcher, invite members UI, and members page are hidden. The underlying org logic still runs (every user still has a default org, todos still scoped to it). Only the **visual layer** is toggled.

---

## 8. GraphQL Rules

### 8.1 — Schema-First

The API generates `schema.graphql` which is committed to the repo. Client apps write `.graphql` operation files. GraphQL Code Generator produces typed document nodes and hooks.

### 8.2 — Operation File Location

- API schema type definitions (SDL): `apps/api/src/features/{name}/{name}.schema.ts`
- API resolvers: `apps/api/src/features/{name}/{name}.router.ts`
- Client operation documents: `apps/{web,mobile}/src/graphql/operations/{name}.graphql`
- Generated output: `apps/{web,mobile}/src/graphql/generated/`

### 8.3 — Client Data Fetching

Client apps use generated React Query hooks (GraphQL Codegen) backed by `graphql-request`. Requests use cookie-based auth. The session cookie carries the active organization. No manual `organizationId` passing in queries — the API resolves it from the session context.

```graphql
# Client just asks for todos — API scopes by active org automatically
query GetTodos {
  todos {
    id
    title
    description
    completed
    createdAt
    updatedAt
  }
}
```

### 8.4 — Resolver Pattern

Every resolver that accesses data must:

1. Extract the session from context via auth middleware.
2. Get `activeOrganizationId` from the session.
3. Verify the user is a member of that organization.
4. Filter all queries by `organizationId`.
5. Return an unauthorized error if any check fails.

---

## 9. Styling Rules

### 9.1 — Design Tokens Only

Never use hardcoded hex, px, or rgb values in component CSS. Every visual property references a `--ds-*` token (defined in `DESIGN_SYSTEM.md`).

### 9.2 — Token Naming

All functional design tokens use the `--ds-` prefix:

```
--ds-text               → Default body text
--ds-background-default → Page canvas
--ds-surface-raised     → Elevated card
--ds-shadow-overlay     → Dropdown shadow
--ds-space-200          → 16px spacing
--ds-border-focused     → Focus ring color
```

Choose tokens by **semantic meaning**, not visual appearance.

### 9.3 — Color Role Selection

| If the color represents...      | Use this role... |
| ------------------------------- | ---------------- |
| Default UI, neutral chrome      | `neutral`        |
| Brand identity, primary actions | `brand`          |
| Informational messages, help    | `information`    |
| Positive outcomes, completion   | `success`        |
| Caution, potential issues       | `warning`        |
| Errors, destructive actions     | `danger`         |
| Non-critical warnings           | `attention`      |
| Severe/heatmap-level urgency    | `severe`         |
| New features, onboarding        | `discovery`      |
| Active / in-progress item       | `open`           |
| Closed / rejected item          | `closed`         |
| Completed item                  | `done`           |

### 9.4 — Emphasis Scale

When choosing between light/dark variants:

| Level       | Use For                        | Text Pairing        |
| ----------- | ------------------------------ | ------------------- |
| `subtlest`  | Lightest tint, background wash | Default text tokens |
| `subtle`    | Slightly stronger tint         | Default text tokens |
| _(default)_ | Standard foreground/border     | Default surface     |
| `bold`      | Strong fill (buttons, badges)  | `--ds-text-inverse` |
| `bolder`    | Even stronger fill             | `--ds-text-inverse` |
| `boldest`   | Maximum saturation             | `--ds-text-inverse` |

### 9.5 — Tailwind Usage

Use the Tailwind preset from `@repo/config/tailwind/preset.js`. It maps all `--ds-*` tokens to utility classes:

```html
<p class="text-ds-text bg-ds-bg">Hello</p>
<span class="bg-ds-bg-danger-bold text-ds-text-inverse rounded px-2 py-0.5">Error</span>
<div class="bg-ds-surface-raised shadow-raised rounded-lg p-4">Card</div>
```

### 9.6 — Theming

Themes are applied via `data-theme` attribute on `<html>`. Implemented modes: `light`, `dark`, `light-high-contrast`, `dark-high-contrast`. The `system` preference mode resolves at runtime to `light` or `dark`.

```html
<html data-theme="light">
  <!-- or "dark", "light-high-contrast", "dark-high-contrast" -->
</html>
```

### 9.7 — Component Styling with CVA

Use `class-variance-authority` (CVA) for component variants. Components accept a `className` prop for contextual overrides via `cn()` (clsx + tailwind-merge).

### 9.8 — No Custom CSS Except for Tokens

Avoid writing custom CSS files. If a style cannot be expressed with Tailwind utilities, add it as a design token first, map it in the preset, then use it via utility class. Custom CSS is only acceptable for token definitions (`globals.css`).

---

## 10. Component Rules

### 10.1 — Three Component Tiers

| Tier           | Location                                            | Purpose                                                                   |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| **Primitives** | `packages/ui/src/components/primitives/`            | Atomic, data-agnostic, shadcn/ui-based (Button, Input, Dialog...)         |
| **Composed**   | `packages/ui/src/components/composed/`              | Multi-primitive compositions (Sidebar, Header, DataTable, OrgSwitcher...) |
| **Feature**    | `apps/{web,mobile}/src/features/{name}/components/` | Feature-specific, data-aware (TodoList, LoginForm...)                     |

### 10.2 — Primitives Rules

- Token-only values. Zero hardcoded hex, px, or rgb.
- `className` prop on every component for contextual overrides.
- Keyboard accessible via Radix UI.
- No translation strings — labels come as props.
- Interaction states via tokens (`hovered`, `pressed`, `disabled` variants), never opacity hacks.
- Variants via CVA.

### 10.3 — Composed Components Rules

- Prop-driven. Do NOT import from app-level stores or hooks.
- All text labels from props (the consumer passes translated strings).
- Data-agnostic — accept data through props, emit events through callbacks.

### 10.4 — Feature Components Rules

- Can import from `@repo/ui`, `@repo/translation`, `@repo/auth`, `@repo/feature-flags`, `@repo/db` (types/validators).
- Can use Zustand stores.
- Must use translation keys for all user-facing strings.
- Form components use `react-hook-form` + Zod resolver using validators from `@repo/db/validators`.

### 10.5 — Control Sizes

Interactive controls follow a consistent t-shirt sizing system:

| Size     | Height | Use Case              |
| -------- | ------ | --------------------- |
| `xsmall` | 24px   | Compact toolbars      |
| `small`  | 28px   | Dense UI              |
| `medium` | 32px   | **Default (most UI)** |
| `large`  | 40px   | Prominent CTAs        |
| `xlarge` | 48px   | Touch targets         |

Medium is always the default. Controls at the same size align visually side-by-side.

---

## 11. Authentication Rules

### 11.1 — Provider

Email + password via better-auth. OAuth extensible later.

### 11.2 — Session Management

Database-backed sessions via Drizzle adapter. Session cookie carries active organization. httpOnly, secure, sameSite.

### 11.3 — Auth Endpoints

better-auth handles auth REST routes at `/api/auth/*`:

- `/api/auth/sign-in/email` — Login
- `/api/auth/sign-up/email` — Signup
- `/api/auth/sign-out` — Logout
- `/api/auth/get-session` — Get current session
- `/api/auth/organization/create` — Create org
- `/api/auth/organization/set-active` — Switch active org
- `/api/auth/organization/list` — List user's orgs
- `/api/auth/organization/invite-member` — Invite member
- `/api/auth/organization/get-members` — Get org members

### 11.4 — Auth Pages

- Login: `/login` — email + password form + "Sign up" link.
- Signup: `/signup` — name + email + password + confirm password + "Sign in" link.
- Both use `AuthLayout` (centered card).
- After login, redirect to `/dashboard`.
- Both pages use translation keys from the `auth` namespace.

### 11.5 — Test User

| Field       | Value                      |
| ----------- | -------------------------- |
| Email       | `test@test.test`           |
| Password    | `ChangeMe123!`             |
| Name        | `Test User`                |
| Default Org | `Personal` (role: `owner`) |

---

## 12. Feature Flags Rules

### 12.1 — Config-Driven

Flags are defined in `packages/feature-flags/src/feature-flags.config.ts` as a typed object. No database, no runtime flag service (for now). Changing a flag requires a code change and redeploy.

### 12.2 — Flag Definition Pattern

```ts
// feature-flags.definition.ts
export const FEATURE_FLAGS = {
  ORGANIZATIONS_VISIBLE: "organizations_visible"
} as const;

// feature-flags.config.ts
export const DEFAULT_FLAGS: FeatureFlags = {
  [FEATURE_FLAGS.ORGANIZATIONS_VISIBLE]: true
};
```

### 12.3 — Consumption

```tsx
// React hook
const isOrgVisible = useFeatureFlag("organizations_visible");

// Server-side
const enabled = isFeatureEnabled("organizations_visible");
```

### 12.4 — Flag Behavior

When a flag is `false`, the **UI is hidden** but the underlying logic still runs. Data models are always multi-tenant regardless of flag state.

---

## 13. Application Shell Rules

### 13.1 — Web & Desktop Layout

```
┌──────────────────────────────────────────────────────────┐
│  Header  [Logo] [OrgSwitcher*] [LangSwitch] [Theme] [User] │
├──────────┬───────────────────────────────────────────────┤
│ Sidebar  │         Main Content                           │
│ Dashboard│                                                │
│ Todos    │                                                │
│ Members* │                                                │
├──────────┴───────────────────────────────────────────────┤
              * = hidden when ORGANIZATIONS_VISIBLE is off
```

- Sidebar: collapsible (Zustand + localStorage). Items: Dashboard, Todos, Members (flag-gated).
- Header: app logo, org switcher (flag-gated), language switcher, theme toggle, user menu.
- Main content: renders the current route. All queries scoped to active organization.

### 13.2 — Mobile Layout

- Drawer navigation replaces sidebar.
- Org switcher in drawer header (flag-gated).
- Language/theme switchers in drawer footer or settings.
- User info + logout in drawer.

### 13.3 — Responsive Breakpoints

| Token | Value  | Layout      |
| ----- | ------ | ----------- |
| `sm`  | 544px  | 1-column    |
| `md`  | 768px  | 1–2 columns |
| `lg`  | 1012px | 2–3 columns |
| `xl`  | 1280px | 3+ columns  |

---

## 14. State Management Rules

### 14.1 — Zustand for Client State

UI state (sidebar collapsed, active theme, active org) lives in Zustand stores. Each store is a separate file in `src/stores/`.

### 14.2 — Persistence

- Web/Desktop: localStorage via Zustand `persist` middleware.
- Mobile: AsyncStorage via Zustand `persist` middleware with AsyncStorage adapter.

### 14.3 — Server State via React Query

Data from the API is fetched and cached through TanStack React Query (via generated GraphQL hooks). Do not duplicate server state in Zustand. Use React Query for server data, Zustand for UI state.

---

## 15. Provider Composition Order

```tsx
// src/providers/index.tsx
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

---

## 16. Desktop (Tauri v2) Rules

### 16.1 — Architecture

Tauri uses the system webview (not bundled Chromium). The frontend is the web app built by Vite. The Rust backend handles native features.

### 16.2 — Key Differences from Electron

- Binary size: ~5–15MB (not 150MB+).
- Security: capability-based permission model (not preload/contextBridge).
- IPC: `invoke()` / `emit()` (type-safe, Rust backend).
- Backend: Rust, not Node.js.

### 16.3 — Tauri Detection

```ts
const isTauri = !!window.__TAURI_INTERNALS__;
```

Desktop-specific UI only renders when `isTauri` is true. The web app gracefully degrades.

### 16.4 — Capabilities

Only grant minimum permissions needed. Defined in `src-tauri/capabilities/default.json`.

---

## 17. Mobile (Expo) Rules

### 17.1 — Architecture

Expo with Expo Router for file-based routing. NativeWind for Tailwind-style styling. Metro bundler configured with `watchFolders` for monorepo resolution.

### 17.2 — Package Sharing

`@repo/ui` is NOT a direct mobile dependency (it's React DOM). Mobile builds its own React Native components but shares types, validators, auth client, translations, feature flags, and GraphQL operations from monorepo packages.

### 17.3 — File-Based Routing

```
src/app/
├── _layout.tsx           # Root (providers)
├── (auth)/
│   ├── login.tsx
│   └── signup.tsx
└── (app)/
    ├── _layout.tsx       # Drawer navigation
    ├── dashboard.tsx
    ├── members.tsx       # Flag-gated
    └── todos/index.tsx
```

---

## 18. Script Standards

### 18.1 — Every Workspace Must Expose

| Script         | Purpose                                     |
| -------------- | ------------------------------------------- |
| `dev`          | Start in dev/watch mode                     |
| `build`        | Production build                            |
| `check`        | `format:check && lint && typecheck && test` |
| `format`       | `prettier --write .`                        |
| `format:check` | `prettier --check .`                        |
| `lint`         | `eslint .`                                  |
| `lint:fix`     | `eslint . --fix`                            |
| `typecheck`    | `tsc --noEmit`                              |
| `test`         | `vitest run`                                |
| `clean`        | Remove build artifacts                      |

### 18.2 — Root-Level Scripts

| Command           | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `pnpm dev`        | Run all apps in dev mode                                                  |
| `pnpm build`      | Build everything in dependency order                                      |
| `pnpm check`      | Full quality gate (format + lint + types + tests)                         |
| `pnpm format`     | Format entire monorepo                                                    |
| `pnpm generate`   | Run GraphQL codegen                                                       |
| `pnpm initialize` | Full bootstrap: reinstall → build → db:generate → db:push → db:seed → dev |
| `pnpm db:*`       | Database operations (generate, push, migrate, seed, studio)               |

### 18.3 — Turborepo Pipeline

- `build` depends on `^build` (build dependencies first).
- `dev` is persistent and not cached.
- `check`, `typecheck`, `test` depend on `^build`.
- `format`, `lint` have no dependencies.
- `db:*` are not cached.

---

## 19. Quality Gates

### 19.1 — Pre-Commit Hook (Husky)

Runs `lint-staged` which applies `prettier --write` and `eslint --fix` on staged files.

### 19.2 — CI Pipeline

Every PR runs: install → build → format:check → lint → typecheck → unit tests → e2e tests.

### 19.3 — Coverage

Minimum 70% per workspace. Configured via `vitest.workspace.ts`.

### 19.4 — Non-Functional Requirements

- **Type safety:** 100% TypeScript strict mode. Zero `any`.
- **Translation coverage:** Every user-facing string uses i18n.
- **Accessibility:** WCAG 2.1 AA. All interactive elements keyboard-navigable and screen-reader friendly. Color never sole communicator. Minimum contrast 4.5:1 normal text, 3:1 large text/UI.
- **Performance:** Lazy-loaded routes. Tree-shaking. Turborepo caching.
- **Security:** CORS on API. CSRF via better-auth. Zod validation on both client and server. Parameterized DB queries (Drizzle). No secrets in client bundles. httpOnly secure session cookies.

---

## 20. Adding a New Feature — Checklist

When implementing a new feature (e.g., "projects"), follow these steps in order:

### 20.1 — Database Layer (`packages/db`)

- [ ] Create `src/schema/{feature}.schema.ts` with `organizationId` FK.
- [ ] Create `src/validators/{feature}.validator.ts` using `drizzle-zod`.
- [ ] Create `src/types/{feature}.type.ts` with inferred types.
- [ ] Add barrel exports in each respective `index.ts`.
- [ ] Run `pnpm db:generate` and `pnpm db:push`.

### 20.2 — Translation (`packages/translation`)

- [ ] Create `src/locales/en/{feature}.json` with all strings.
- [ ] Add translations for other languages (sr, de).
- [ ] Add namespace to `TRANSLATION_NAMESPACES` in `translation.definition.ts`.

### 20.3 — API Feature (`apps/api`)

- [ ] Create `src/features/{feature}/` directory.
- [ ] Create `{feature}.definition.ts` — constants.
- [ ] Create `{feature}.schema.ts` — GraphQL SDL definitions.
- [ ] Create `{feature}.type.ts` — TypeScript types/interfaces (as needed).
- [ ] Create `{feature}.adapter.ts` — Drizzle queries (org-scoped).
- [ ] Create `{feature}.util.ts` — business logic helpers.
- [ ] Create `{feature}.config.ts` — feature config.
- [ ] Create `{feature}.router.ts` — GraphQL resolvers.
- [ ] Register types and resolvers in `src/schema/index.ts`.
- [ ] Regenerate `schema.graphql`.

### 20.4 — GraphQL Operations (Client)

- [ ] Create `apps/web/src/graphql/operations/{feature}.graphql`.
- [ ] Create `apps/mobile/src/graphql/operations/{feature}.graphql` (same or symlinked).
- [ ] Run `pnpm generate`.

### 20.5 — Web Feature (`apps/web`)

- [ ] Create `src/features/{feature}/` directory following FDD pattern.
- [ ] Create adapter using generated typed documents.
- [ ] Create page route component using `AppLayout`.
- [ ] Create feature-specific components in `components/`.
- [ ] Add route to `src/router.tsx`.
- [ ] Add navigation item to sidebar (with feature flag if applicable).
- [ ] All strings from translation namespace.

### 20.6 — Mobile Feature (`apps/mobile`)

- [ ] Mirror the web feature structure with React Native components.
- [ ] Add navigation screen to Expo Router.
- [ ] Add drawer item.

### 20.7 — Tests

- [ ] Unit tests for adapter, utils, validators.
- [ ] Component render tests.
- [ ] E2E test spec in `apps/web/e2e/{feature}.spec.ts`.

---

## 21. Environment Variables

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/monorepo_dev

# Auth
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:4000

# API
API_PORT=4000
API_URL=http://localhost:4000

# Web
VITE_API_URL=http://localhost:4000
VITE_GRAPHQL_URL=http://localhost:4000/graphql

# Mobile
EXPO_PUBLIC_API_URL=http://localhost:4000
EXPO_PUBLIC_GRAPHQL_URL=http://localhost:4000/graphql
```

**Rules:**

- Server-side vars: plain names (`DATABASE_URL`, `API_PORT`).
- Vite client-side vars: prefixed `VITE_`.
- Expo client-side vars: prefixed `EXPO_PUBLIC_`.
- Never commit `.env`. Commit `.env.example` only.
- No secrets in client bundles.

---

## 22. Common Mistakes to Avoid

| Mistake                                        | Correct Approach                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Hardcoding a string in JSX                     | Use `t("namespace.key")` from `@repo/translation`                                           |
| Using `any`                                    | Use `unknown` and narrow, or define a proper type                                           |
| Using hex colors in components                 | Use `--ds-*` token via Tailwind class (`text-ds-text-subtle`)                               |
| Creating a Redux store                         | Use Zustand with `persist` middleware                                                       |
| Importing from internal package paths          | Import from exported subpaths (`@repo/db/schema`, not `../../packages/db/src/schema/index`) |
| Forgetting `organizationId` on a new table     | Every data entity must have `organizationId` FK                                             |
| Querying data without org filter               | All data queries must filter by `activeOrganizationId` from session                         |
| Using `opacity-50` for hover                   | Use token-based interaction states (`hovered`, `pressed` variants)                          |
| Putting constants in component files           | Put them in `{feature}.definition.ts`                                                       |
| Skipping keyboard navigation                   | All interactive elements must be keyboard-accessible (Radix handles this)                   |
| Using `px` for spacing                         | Use space tokens (`--ds-space-*`) via Tailwind classes                                      |
| Adding a library for something already covered | Check the tech stack table first                                                            |
| Creating a new CSS file                        | Add token to `globals.css`, map in preset, use via utility                                  |
| Storing server data in Zustand                 | Use React Query for server data, Zustand for UI state                                       |
| Making UI components data-aware                | Primitives/composed components are prop-driven and data-agnostic                            |
| Skipping validation on forms                   | Use `react-hook-form` + Zod resolver with validators from `@repo/db/validators`             |
| Forgetting to scope by feature flag            | Check if the feature should be gated by `ORGANIZATIONS_VISIBLE` or future flags             |
| Using `dangerouslySetInnerHTML`                | Never. React handles XSS prevention.                                                        |
| Committing `.env`                              | Only `.env.example` is committed                                                            |

---

## 23. Implementation Order

Follow the stage dependency graph:

```
Stage 1: Monorepo Foundation
  └─► Stage 2: Shared Packages (config, db, auth, translation, feature-flags)
       └─► Stage 3: API Application
            └─► Stage 4: UI Package & Design System
                 └─► Stage 5: Web Application
                      ├─► Stage 6: Desktop (Tauri)
                      └─► Stage 7: Mobile (Expo)
Stage 8: Testing & Production (after all above)
```

Each stage results in a **buildable, lintable, type-checkable workspace**. Never leave the monorepo in a broken state between stages.

---

_This document is the definitive reference for building in this monorepo. When in doubt, consult `MONOREPO_PLAN.md` for full architecture details and `DESIGN_SYSTEM.md` for visual specifications._
