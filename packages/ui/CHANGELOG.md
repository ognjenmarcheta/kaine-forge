# @repo/ui

## 1.2.1

### Patch Changes

- ceef03e: Intentional dependency upgrades from issue #198: Dependabot freezes for mobile singleton packages, jsdom 30, web React 19.2 catalog, GraphQL Codegen v7 suite with client regenerate, and Expo SDK 55 mobile graph (RN 0.83, expo ~55).
- 14601b7: Use a single `radix-ui` entrypoint (drop dual `@radix-ui/*` pins) and bump to 1.6.7 for root-import type and primitive fixes.
- fc1395e: Upgrade web tooling to Vite 8 (Rolldown-powered build, lightningcss minification). Replace the invalid `var()` media query in `globals.css` with its literal breakpoint value: media queries cannot consume custom properties, so the sub-768px layout block previously never matched in any browser and now applies as intended. Closes the vite workstream from the 2026-08 security triage.

## 1.2.0

### Minor Changes

- 7a6e25d: Rename TeamSwitcher public API to OrganizationSwitcher to match CONTEXT domain language.

### Patch Changes

- 22a7c4d: Close a batch of principal architecture review findings: honest package `dev` scripts, stronger catalog enforcement, fuller `create:package` wiring, Vitest UI/`test:watch`, digest-pinned Docker bases with a blocking Trivy CRITICAL gate, and CI/DX hardening (knip/boundaries on PRs, safer concurrency, caches, launch configs).
- 7bdc15c: Add dead-code and dependency-graph enforcement, and finish declaring the graph.

  `pnpm knip` and `pnpm boundaries` are new and both run in `pnpm check`. `turbo boundaries` complements the existing ESLint rules rather than replacing them: it catches importing a package a workspace does not declare, which ESLint cannot see, while ESLint keeps enforcing the web/mobile UI split and the `@repo/*/src` deep-import ban. `boundaries` is experimental in Turbo 2.8, which is why it is additive.

  `turbo boundaries` found 153 undeclared imports: 145 test files importing `vitest`, and `packages/config/eslint/*.js` importing six ESLint plugins. All resolved only through pnpm root hoisting. Every workspace that imports `vitest` now declares it, and the six plugins moved from the root to `@repo/config`, which is where they are imported — the root `eslint.config.mjs` only re-exports. `pnpm --filter <workspace> test` no longer depends on hoisting. One exception remains, marked with `@boundaries-ignore`: `packages/config/mobile-lan-dev.test.ts` reaches into `tooling/dev-mobile-lan.ts`, a loose root script with no workspace of its own to be tested from.

  knip is configured against this repo's conventions rather than run on defaults, which reported 63 false "unused files". Test files are entry points; the vitest `react-native` alias target, Expo/Metro config, and template placeholder files are ignored; the `exports` and `types` rules are off because this repo deliberately exports internals for unit testing. The dependency rule keeps an explicit ignore list for things static analysis cannot see: `pino-pretty` (referenced as a transport string), `tailwindcss` (a Tailwind v4 peer of `@tailwindcss/vite`), the `catalog:mobile` React Native singleton pins, Expo plugin inferences, and `zod` in `@repo/auth`.

  That last one is worth recording: knip reported `zod` as unused in `@repo/auth` and nothing imports it, but removing it breaks the build with TS2742 — better-auth's inferred types reference zod, so it is required for declaration emit. The pre-existing catalog alignment test already guarded it. **Verify a dependency removal with a build, not a grep.**

  Removed genuinely dead code that knip surfaced, each verified unreferenced first: eight source files across api/web/mobile, plus `react-i18next` from `@repo/translation` (declared but imported nowhere in the repo). Deleted `vitest.workspace.ts` — it used `defineWorkspace`, deprecated in the installed Vitest 3.2.4 and removed in 4, was invoked by nothing, and had drifted from `vitest.coverage.config.ts`, which is now the single project list.

  Normalized the four tsconfigs that extended the root base directly instead of the shared presets in `packages/config/typescript/`.

  Five new alignment tests, each verified to fail when violated: every workspace declares `@repo/config`; `globalDependencies` never lists the lockfile or globs a package; neither Dockerfile hand-copies `packages/config`; vitest importers declare vitest; ESLint plugins live in `@repo/config` and not the root.

- 2a37f9d: Generate mobile NativeWind design tokens from packages/ui globals.css and fail when they drift.
- 79fa89e: Complete TypeScript project references for tsc-emitting packages: composite `tsconfig.build.json` + `tsc -b`, while typecheck keeps source paths (issue #147).

## 1.1.3

### Patch Changes

- 480a52d: Add design-token contract test (DESIGN_SYSTEM.md ↔ globals.css ↔ Tailwind preset) and fix the stale base-token example in the docs

## 1.1.2

### Patch Changes

- d5f6d92: Add AI todo generation with OpenAI and DeepSeek provider support.

## 1.1.1

### Patch Changes

- 07b5833: Migrate all UI primitives from shadcn bridge variables to direct --ds-\* design token references and add accent color token suite (9 hues x 7 token types)
- 532bf1a: UI update

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

## 1.0.0

### Major Changes

- 9633894: First release test
