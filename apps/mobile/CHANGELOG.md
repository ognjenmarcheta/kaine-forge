# @repo/mobile

## 1.5.2

### Patch Changes

- Updated dependencies [cd623ee]
  - @repo/translation@1.3.2

## 1.5.1

### Patch Changes

- 67abc54: Add a client-safe `@repo/storage/client` entry and move the web and mobile upload hooks onto it. The root barrel re-exported the S3 client, which pulled `@aws-sdk/client-s3` and its `node:https` handler into the Expo bundle and broke `expo export`. ESLint now rejects server-only package entries in client apps, and pull requests that touch shared packages or the lockfile run the mobile export.
- Updated dependencies [67abc54]
  - @repo/storage@1.2.2

## 1.5.0

### Minor Changes

- ceef03e: Intentional dependency upgrades from issue #198: Dependabot freezes for mobile singleton packages, jsdom 30, web React 19.2 catalog, GraphQL Codegen v7 suite with client regenerate, and Expo SDK 55 mobile graph (RN 0.83, expo ~55).

### Patch Changes

- 25b6cc4: Remove the unused `@graphql-codegen/typescript` dependency (the codegen config uses only the `client` preset plus `typescript-operations`/`typescript-react-query`), declare `@commitlint/types` at the root for the commitlint config's JSDoc type import, and refresh generated GraphQL clients with the lockfile-current codegen toolchain. Fixes the `pnpm knip` failure on `main` and the latent `graphql-schema` regeneration drift.
- Updated dependencies [ceef03e]
- Updated dependencies [9f617ba]
  - @repo/mobile-ui@1.0.4
  - @repo/auth@1.5.2
  - @repo/storage@1.2.1
  - @repo/feature-flags@1.1.1
  - @repo/logger@1.1.0
  - @repo/persistence@1.1.2
  - @repo/query@1.3.6
  - @repo/todos@1.0.4
  - @repo/translation@1.3.1

## 1.4.1

### Patch Changes

- Updated dependencies [5aa8a1d]
  - @repo/auth@1.5.1

## 1.4.0

### Minor Changes

- 8be5914: Enable mobile social login with @better-auth/expo deep-link OAuth (server expo plugin, client expoClient, env-gated buttons).

### Patch Changes

- 2df98af: Fix the broken web/desktop build by adding the missing `@repo/auth/form` Vite (and mobile Vitest) alias, correct the default `API_CORS_ORIGINS` to the web dev port, migrate organization-scoped query keys to `createActiveOrganizationQueryKey` from `@repo/query` (deprecating `createTodoListQueryKey`), and harden template adoption to cover the `kaineforge`/`kaine_forge` identity forms, mobile auth prefixes, docs, and AI-source files so `template:adopt --check` passes after a by-the-book adoption.
- 7bdc15c: Add dead-code and dependency-graph enforcement, and finish declaring the graph.

  `pnpm knip` and `pnpm boundaries` are new and both run in `pnpm check`. `turbo boundaries` complements the existing ESLint rules rather than replacing them: it catches importing a package a workspace does not declare, which ESLint cannot see, while ESLint keeps enforcing the web/mobile UI split and the `@repo/*/src` deep-import ban. `boundaries` is experimental in Turbo 2.8, which is why it is additive.

  `turbo boundaries` found 153 undeclared imports: 145 test files importing `vitest`, and `packages/config/eslint/*.js` importing six ESLint plugins. All resolved only through pnpm root hoisting. Every workspace that imports `vitest` now declares it, and the six plugins moved from the root to `@repo/config`, which is where they are imported — the root `eslint.config.mjs` only re-exports. `pnpm --filter <workspace> test` no longer depends on hoisting. One exception remains, marked with `@boundaries-ignore`: `packages/config/mobile-lan-dev.test.ts` reaches into `tooling/dev-mobile-lan.ts`, a loose root script with no workspace of its own to be tested from.

  knip is configured against this repo's conventions rather than run on defaults, which reported 63 false "unused files". Test files are entry points; the vitest `react-native` alias target, Expo/Metro config, and template placeholder files are ignored; the `exports` and `types` rules are off because this repo deliberately exports internals for unit testing. The dependency rule keeps an explicit ignore list for things static analysis cannot see: `pino-pretty` (referenced as a transport string), `tailwindcss` (a Tailwind v4 peer of `@tailwindcss/vite`), the `catalog:mobile` React Native singleton pins, Expo plugin inferences, and `zod` in `@repo/auth`.

  That last one is worth recording: knip reported `zod` as unused in `@repo/auth` and nothing imports it, but removing it breaks the build with TS2742 — better-auth's inferred types reference zod, so it is required for declaration emit. The pre-existing catalog alignment test already guarded it. **Verify a dependency removal with a build, not a grep.**

  Removed genuinely dead code that knip surfaced, each verified unreferenced first: eight source files across api/web/mobile, plus `react-i18next` from `@repo/translation` (declared but imported nowhere in the repo). Deleted `vitest.workspace.ts` — it used `defineWorkspace`, deprecated in the installed Vitest 3.2.4 and removed in 4, was invoked by nothing, and had drifted from `vitest.coverage.config.ts`, which is now the single project list.

  Normalized the four tsconfigs that extended the root base directly instead of the shared presets in `packages/config/typescript/`.

  Five new alignment tests, each verified to fail when violated: every workspace declares `@repo/config`; `globalDependencies` never lists the lockfile or globs a package; neither Dockerfile hand-copies `packages/config`; vitest importers declare vitest; ESLint plugins live in `@repo/config` and not the root.

- 6b03bd4: Add type-aware ESLint via the TypeScript project service: `no-floating-promises`, `no-misused-promises`, and `await-thenable` as errors across the repo (excluding files not covered by any tsconfig). Fix the 14 real violations it surfaced — `void`-wrapping async JSX event handlers and fire-and-forget lifecycle/teardown calls, and extracting the API server's async request handler — with no behavior change. `require-await` is intentionally not enabled (noise on async functions without `await`, e.g. resolvers).
- 6abdbec: Apply NativeWind dark class/scheme from the resolved theme so design tokens remap in dark mode, and use a single mobile theme persistence key.
- e69a994: Validate the mobile client environment at boot with a zod schema (`apps/mobile/src/env.config.ts`), mirroring the API and web validators. A misconfigured `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_GRAPHQL_URL` (e.g. a value missing its `http(s)://` protocol) now fails fast with a clear message, and a blank value falls back to its default instead of overriding it. The auth config and GraphQL HTTP/WS clients read the validated env via `getMobileEnv()`.
- 44573ea: Declare `@repo/feature-flags` and resolve organization UI visibility through the shared flag helpers instead of hardcoding true.
- 2a37f9d: Generate mobile NativeWind design tokens from packages/ui globals.css and fail when they drift.
- 81919a2: Share auth form validation across web and mobile via `@repo/auth/form`, and document intentional mobile-ui subset in the design system.
- 21b3002: Make the Turbo dependency graph honest and stop the cache from invalidating itself.

  `@repo/config` was consumed by every workspace through relative `tsconfig` extends and the root ESLint/Prettier configs, but was declared as a dependency by nobody. Three workarounds had grown around that missing edge: a `packages/config/**` entry in `globalDependencies`, a hand-written `COPY --from=pruner /app/packages/config/` in both Dockerfiles because `turbo prune` correctly excluded it, and a hardcoded `SHARED_BUILD_WORKSPACE_DIRS` in `.ai/release.util.ts`. Every workspace now declares `@repo/config`, and all three workarounds are gone — `turbo prune` includes the presets on its own, and `release-apps` derives affected apps from the graph.

  Cache inputs are now scoped to what each task actually reads. Global hashed files drop from 27 to 2:
  - `pnpm-lock.yaml` left `globalDependencies` — Turborepo already hashes each package's resolved external dependencies, so listing the whole lockfile invalidated every task in every package on any dependency bump (Renovate lands one grouped bump weekly).
  - `eslint.config.mjs` and `.prettierrc*` moved from `globalDependencies` to per-task `inputs` on `lint` and `format:check` via `$TURBO_ROOT$`, so a lint-config edit no longer invalidates `build` and `test`.
  - Globbing `packages/config/**` had pulled gitignored `.turbo/*.log` files, `CHANGELOG.md`, and the package's own tests into the global hash. A new `packages/config/turbo.json` narrows its `build` inputs to the preset files.
  - `build` now excludes `CHANGELOG.md`, so `changeset version` no longer busts every build cache.
  - `CI` moved from `globalEnv` to `globalPassThroughEnv`. It is unset locally and `true` in Actions, so hashing it meant a CI cache entry could never be restored on a developer machine, or the reverse.

  Three alignment tests guard the fix: every workspace must declare `@repo/config`, `globalDependencies` must not glob a package or list the lockfile, and neither Dockerfile may hand-copy `packages/config`.

  `test` keeps its `^build` dependency. Wiping every `dist` and running tests without building fails `@repo/email#test`, because only `apps/api`, `apps/mobile`, `packages/auth`, and `packages/mobile-ui` alias `@repo/*` to source in their vitest config; the rest resolve siblings through package exports. That is now recorded in the task description.

- Updated dependencies [2df98af]
- Updated dependencies [22a7c4d]
- Updated dependencies [8d04ade]
- Updated dependencies [bfde85a]
- Updated dependencies [4c45e37]
- Updated dependencies [7bdc15c]
- Updated dependencies [8be5914]
- Updated dependencies [1114f7e]
- Updated dependencies [81919a2]
- Updated dependencies [b64b17a]
- Updated dependencies [fdce5d8]
- Updated dependencies [79fa89e]
- Updated dependencies [21b3002]
  - @repo/todos@1.0.4
  - @repo/auth@1.5.0
  - @repo/feature-flags@1.1.1
  - @repo/logger@1.1.0
  - @repo/mobile-ui@1.0.3
  - @repo/persistence@1.1.2
  - @repo/query@1.3.6
  - @repo/storage@1.2.0
  - @repo/translation@1.3.1

## 1.3.2

### Patch Changes

- Updated dependencies [87e6d0b]
  - @repo/translation@1.3.0
  - @repo/auth@1.4.2

## 1.3.1

### Patch Changes

- Updated dependencies [f136b60]
  - @repo/translation@1.2.0
  - @repo/auth@1.4.1

## 1.3.0

### Minor Changes

- c1d66c1: Clients authenticate through better-auth's client (organization + bearer flows) with env-gated GitHub/Google social login buttons

### Patch Changes

- Updated dependencies [c046f32]
- Updated dependencies [68ebc61]
- Updated dependencies [b2b0a3e]
- Updated dependencies [4057465]
- Updated dependencies [c1d66c1]
- Updated dependencies [9cc4adf]
  - @repo/auth@1.4.0

## 1.2.12

### Patch Changes

- c9b20e0: Extend the local AuthUser session mirrors with the new emailVerified field exposed by @repo/auth sessions
- Updated dependencies [f884c6b]
- Updated dependencies [d03004e]
- Updated dependencies [c72eb56]
- Updated dependencies [5d8d4a1]
- Updated dependencies [3733f8d]
  - @repo/auth@1.3.0

## 1.2.11

### Patch Changes

- d5f6d92: Add AI todo generation with OpenAI and DeepSeek provider support.

## 1.2.10

### Patch Changes

- deb8ff6: Fix mobile React Native singleton resolution across the app and shared mobile UI package.
- Updated dependencies [deb8ff6]
  - @repo/mobile-ui@1.0.2

## 1.2.9

### Patch Changes

- 9d42572: Deepen Todo client workflows and Active Organization provider orchestration while preserving app behavior.
- Updated dependencies [9d42572]
  - @repo/query@1.3.5
  - @repo/todos@1.0.3

## 1.2.8

### Patch Changes

- Updated dependencies [35d096a]
  - @repo/query@1.3.4

## 1.2.7

### Patch Changes

- 69f4711: Deepen API auth transport, storage lifecycle, shared upload/auth transitions, explicit query runtime registration, and preference persistence modules.
- Updated dependencies [69f4711]
  - @repo/query@1.3.3
  - @repo/storage@1.1.2
  - @repo/persistence@1.1.1

## 1.2.6

### Patch Changes

- 1d159d2: Deepen Authenticated Organization Scope, Active Organization lifecycle, Todo workflow, Attachment lifecycle, Translation runtime, API runtime, and GraphQL feature composition seams.
- Updated dependencies [1d159d2]
  - @repo/auth@1.2.2
  - @repo/query@1.3.2
  - @repo/todos@1.0.2
  - @repo/translation@1.1.1

## 1.2.5

### Patch Changes

- af949dd: Deepen shared auth, query, Todo, storage upload, persistence, and API scope architecture behind focused Modules and Adapters.
- Updated dependencies [af949dd]
  - @repo/auth@1.2.1
  - @repo/query@1.3.1
  - @repo/storage@1.1.1
  - @repo/todos@1.0.1

## 1.2.4

### Patch Changes

- 7b286b2: Deepen shared auth transport, organization-scoped query cache helpers, upload lifecycle, persistence adapters, and server auth internals.
- 7af7edb: Deepen organization-scoped auth, data access, client organization selection, and session transport.
- Updated dependencies [7b286b2]
- Updated dependencies [7af7edb]
  - @repo/auth@1.2.0
  - @repo/query@1.3.0
  - @repo/storage@1.1.0
  - @repo/persistence@1.1.0

## 1.2.3

### Patch Changes

- Updated dependencies [29a0d96]
  - @repo/auth@1.1.2

## 1.2.2

### Patch Changes

- efcb73a: Backport template-safe runtime hardening, Docker support, bearer auth fallback, organization members wiring, mobile UI primitives, and generated AI assistant scaffold.
- Updated dependencies [efcb73a]
  - @repo/auth@1.1.1
  - @repo/mobile-ui@1.0.1

## 1.2.1

### Patch Changes

- 532bf1a: UI update

## 1.2.0

### Minor Changes

- 0ebaed1: Change graphql client

### Patch Changes

- Updated dependencies [0ebaed1]
  - @repo/query@1.2.0

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

### Patch Changes

- Updated dependencies [42437fd]
  - @repo/translation@1.1.0
  - @repo/auth@1.1.0

## 1.0.0

### Major Changes

- 9633894: First release test

### Patch Changes

- Updated dependencies [9633894]
  - @repo/translation@1.0.0
  - @repo/auth@1.0.0
