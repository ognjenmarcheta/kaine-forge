---
"@repo/config": minor
"@repo/api": patch
"@repo/web": patch
"@repo/mobile": patch
"@repo/desktop": patch
"@repo/auth": patch
"@repo/db": patch
"@repo/email": patch
"@repo/feature-flags": patch
"@repo/logger": patch
"@repo/mobile-ui": patch
"@repo/persistence": patch
"@repo/query": patch
"@repo/storage": patch
"@repo/todos": patch
"@repo/translation": patch
"@repo/ui": patch
---

Add dead-code and dependency-graph enforcement, and finish declaring the graph.

`pnpm knip` and `pnpm boundaries` are new and both run in `pnpm check`. `turbo boundaries` complements the existing ESLint rules rather than replacing them: it catches importing a package a workspace does not declare, which ESLint cannot see, while ESLint keeps enforcing the web/mobile UI split and the `@repo/*/src` deep-import ban. `boundaries` is experimental in Turbo 2.8, which is why it is additive.

`turbo boundaries` found 153 undeclared imports: 145 test files importing `vitest`, and `packages/config/eslint/*.js` importing six ESLint plugins. All resolved only through pnpm root hoisting. Every workspace that imports `vitest` now declares it, and the six plugins moved from the root to `@repo/config`, which is where they are imported — the root `eslint.config.mjs` only re-exports. `pnpm --filter <workspace> test` no longer depends on hoisting. One exception remains, marked with `@boundaries-ignore`: `packages/config/mobile-lan-dev.test.ts` reaches into `tooling/dev-mobile-lan.ts`, a loose root script with no workspace of its own to be tested from.

knip is configured against this repo's conventions rather than run on defaults, which reported 63 false "unused files". Test files are entry points; the vitest `react-native` alias target, Expo/Metro config, and template placeholder files are ignored; the `exports` and `types` rules are off because this repo deliberately exports internals for unit testing. The dependency rule keeps an explicit ignore list for things static analysis cannot see: `pino-pretty` (referenced as a transport string), `tailwindcss` (a Tailwind v4 peer of `@tailwindcss/vite`), the `catalog:mobile` React Native singleton pins, Expo plugin inferences, and `zod` in `@repo/auth`.

That last one is worth recording: knip reported `zod` as unused in `@repo/auth` and nothing imports it, but removing it breaks the build with TS2742 — better-auth's inferred types reference zod, so it is required for declaration emit. The pre-existing catalog alignment test already guarded it. **Verify a dependency removal with a build, not a grep.**

Removed genuinely dead code that knip surfaced, each verified unreferenced first: eight source files across api/web/mobile, plus `react-i18next` from `@repo/translation` (declared but imported nowhere in the repo). Deleted `vitest.workspace.ts` — it used `defineWorkspace`, deprecated in the installed Vitest 3.2.4 and removed in 4, was invoked by nothing, and had drifted from `vitest.coverage.config.ts`, which is now the single project list.

Normalized the four tsconfigs that extended the root base directly instead of the shared presets in `packages/config/typescript/`.

Five new alignment tests, each verified to fail when violated: every workspace declares `@repo/config`; `globalDependencies` never lists the lockfile or globs a package; neither Dockerfile hand-copies `packages/config`; vitest importers declare vitest; ESLint plugins live in `@repo/config` and not the root.
