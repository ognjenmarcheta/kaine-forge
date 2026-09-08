# @repo/config

## 1.3.0

### Minor Changes

- 56a9dc6: Add `anti-slop/*` ESLint rules: ban chained type assertions, `Shape` in type names, `unknown`-concealing aliases, `Reflect.get`/`Reflect.apply`, and the broad `object` type; require a `// SAFETY:` invariant comment on every non-const type assertion in non-test code. Lint task inputs now include `packages/config/eslint/**` so shared rule changes invalidate workspace lint caches.

## 1.2.0

### Minor Changes

- 7bdc15c: Add dead-code and dependency-graph enforcement, and finish declaring the graph.

  `pnpm knip` and `pnpm boundaries` are new and both run in `pnpm check`. `turbo boundaries` complements the existing ESLint rules rather than replacing them: it catches importing a package a workspace does not declare, which ESLint cannot see, while ESLint keeps enforcing the web/mobile UI split and the `@repo/*/src` deep-import ban. `boundaries` is experimental in Turbo 2.8, which is why it is additive.

  `turbo boundaries` found 153 undeclared imports: 145 test files importing `vitest`, and `packages/config/eslint/*.js` importing six ESLint plugins. All resolved only through pnpm root hoisting. Every workspace that imports `vitest` now declares it, and the six plugins moved from the root to `@repo/config`, which is where they are imported — the root `eslint.config.mjs` only re-exports. `pnpm --filter <workspace> test` no longer depends on hoisting. One exception remains, marked with `@boundaries-ignore`: `packages/config/mobile-lan-dev.test.ts` reaches into `tooling/dev-mobile-lan.ts`, a loose root script with no workspace of its own to be tested from.

  knip is configured against this repo's conventions rather than run on defaults, which reported 63 false "unused files". Test files are entry points; the vitest `react-native` alias target, Expo/Metro config, and template placeholder files are ignored; the `exports` and `types` rules are off because this repo deliberately exports internals for unit testing. The dependency rule keeps an explicit ignore list for things static analysis cannot see: `pino-pretty` (referenced as a transport string), `tailwindcss` (a Tailwind v4 peer of `@tailwindcss/vite`), the `catalog:mobile` React Native singleton pins, Expo plugin inferences, and `zod` in `@repo/auth`.

  That last one is worth recording: knip reported `zod` as unused in `@repo/auth` and nothing imports it, but removing it breaks the build with TS2742 — better-auth's inferred types reference zod, so it is required for declaration emit. The pre-existing catalog alignment test already guarded it. **Verify a dependency removal with a build, not a grep.**

  Removed genuinely dead code that knip surfaced, each verified unreferenced first: eight source files across api/web/mobile, plus `react-i18next` from `@repo/translation` (declared but imported nowhere in the repo). Deleted `vitest.workspace.ts` — it used `defineWorkspace`, deprecated in the installed Vitest 3.2.4 and removed in 4, was invoked by nothing, and had drifted from `vitest.coverage.config.ts`, which is now the single project list.

  Normalized the four tsconfigs that extended the root base directly instead of the shared presets in `packages/config/typescript/`.

  Five new alignment tests, each verified to fail when violated: every workspace declares `@repo/config`; `globalDependencies` never lists the lockfile or globs a package; neither Dockerfile hand-copies `packages/config`; vitest importers declare vitest; ESLint plugins live in `@repo/config` and not the root.

- 1980c3e: Add `import/no-cycle` (error, bounded `maxDepth: 10`, `ignoreExternal`) to the shared ESLint config so circular imports — which break tree-shaking and cause init-order bugs — are caught in CI. The repo currently has zero cycles, so the rule ships as an error.
- 6558e8f: Enforce token-only styling in lint: ban hardcoded hex colors and arbitrary Tailwind color values (`bg-[#fff]`, `rgb()`/`hsl()`) across web, desktop, `@repo/ui`, mobile, and `@repo/mobile-ui` source so all color flows through `--ds-*` design tokens. The rules compose with the existing i18n and native-`<button>` bans rather than replacing them. The current codebase has zero violations, so the rules ship as errors.
- 6b03bd4: Add type-aware ESLint via the TypeScript project service: `no-floating-promises`, `no-misused-promises`, and `await-thenable` as errors across the repo (excluding files not covered by any tsconfig). Fix the 14 real violations it surfaced — `void`-wrapping async JSX event handlers and fire-and-forget lifecycle/teardown calls, and extracting the API server's async request handler — with no behavior change. `require-await` is intentionally not enabled (noise on async functions without `await`, e.g. resolvers).
- d824b62: Centralize shared deps with pnpm catalogs, tighten Turbo cache contracts, and enforce package boundary lint rules.

### Patch Changes

- 22a7c4d: Close a batch of principal architecture review findings: honest package `dev` scripts, stronger catalog enforcement, fuller `create:package` wiring, Vitest UI/`test:watch`, digest-pinned Docker bases with a blocking Trivy CRITICAL gate, and CI/DX hardening (knip/boundaries on PRs, safer concurrency, caches, launch configs).
- 3f5cda6: Add static analysis and container scanning to CI.

  New `CodeQL` workflow analyzes `javascript-typescript` with the `security-extended` query pack on push to `main`, on pull requests, and weekly. Results land in the Security tab. Supply-chain coverage was previously `pnpm audit` plus Gitleaks, both of which look at dependencies and secrets — nothing inspected the repo's own code for injection, path traversal, or unsafe sinks.

  `docker-images` is now a matrix over api/web instead of two sequential build steps, so the two images build in parallel, and each is scanned with Trivy and gets an SPDX SBOM. Images were built in CI but never scanned, and never produced a bill of materials, even though the `release/<app>` branch contract makes them the deployment artifact.

  Trivy uploads SARIF for CRITICAL and HIGH with `ignore-unfixed`, and a second CRITICAL-only pass is `continue-on-error` for now. Blocking is deliberately deferred: the base images are floating tags (`node:22-slim`, `nginxinc/nginx-unprivileged:alpine`), so a newly published CVE in an unchanged base layer would otherwise fail unrelated PRs. Pin the base images by digest, then flip that step to blocking.

- c7bc72f: Share one Turbo cache restore pool across CI jobs instead of two isolated namespaces.

  `check-fast` saved under `turbo-check-*` and `build-core` under `turbo-build-core-*`, with each job's `restore-keys` scoped to its own prefix. Turbo's local cache is content-addressed by task hash (`<hash>.tar.zst`), so those namespaces stored overlapping artifacts twice and neither job could ever reuse the other's work — against a 10 GB per-repo cache cap.

  Save keys stay unique per job and commit, because GitHub cache entries are immutable and a shared save key would make every job after the first fail to save. Only the restore prefix is unified, to `turbo-${{ runner.os }}-`, so any job restores the newest Turbo cache from any prior job or run.

  No cache step was added to `mobile-typecheck` or `graphql-schema`: the former invokes `tsc` through `pnpm --filter` rather than Turbo, and the latter's `generate` task is `cache: false`, so neither would benefit.

  Remote caching remains opt-in through the existing `TURBO_TOKEN`/`TURBO_TEAM` wiring. It is worth enabling now that `CI` is no longer part of the global hash — before that, a CI-produced cache entry could never be restored on a developer machine.

- 80174c2: Add a monorepo-alignment test asserting every testable workspace ships at least one vitest test, so the blanket `--passWithNoTests` flag can no longer let a test-free package pass green. `apps/e2e` is excluded (it ships Playwright specs). All 17 workspaces pass today.
- fdce5d8: Template audit follow-through fixes:
  - `@repo/api`: batch `Todo.attachments` and `Note.todos` through per-request DataLoaders, surface attachment lookup failures instead of returning `[]`, and reject `createTodo` inputs whose `noteId` belongs to another organization.
  - `@repo/db`: add organization-scoped indexes on `todos`, `notes`, and `files` (migration `0008`).
  - `@repo/config`: enforce `@typescript-eslint/no-explicit-any` as an error.
  - `@repo/translation`: locale-consistency test now discovers namespaces from disk, covering `assistant`, `notes`, and `storage`.

- ddb1ff8: Enable TypeScript incremental compilation (`.tsbuildinfo`) in the shared package base config without turning on project-reference `composite` (still deferred — issue #147).
- 79fa89e: Complete TypeScript project references for tsc-emitting packages: composite `tsconfig.build.json` + `tsc -b`, while typecheck keeps source paths (issue #147).
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

## 1.1.3

### Patch Changes

- 89c319b: Add a LAN mobile dev workflow for physical device testing against a laptop-hosted API.

## 1.1.2

### Patch Changes

- deb8ff6: Fix mobile React Native singleton resolution across the app and shared mobile UI package.

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
