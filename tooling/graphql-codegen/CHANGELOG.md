# @repo/graphql-codegen

## 1.2.1

### Patch Changes

- a91917d: Format GraphQL client output after generate via codegen afterAllFileWrite Prettier hook.
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

## 1.2.0

### Minor Changes

- 0ebaed1: Change graphql client

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

## 1.0.0

### Major Changes

- 9633894: First release test
