# ADR 0025: API bounded contexts and the context-boundary lint rule

- Status: Accepted
- Date: 2026-11-06
- Applies to: `apps/api/src/features/**`, `packages/config/eslint/api-contexts.js`, `packages/config/eslint/api-boundaries.js`

## Context

Agents work best when the code for a task is small and easy to find, the vocabulary is consistent,
and tools enforce the boundaries. `CONTEXT.md` gives one vocabulary, and the package gates keep
`@repo/*` boundaries. Inside `apps/api`, though, 16 feature folders formed one flat area. Nothing
said which business area a feature belongs to, or which features it may import. An agent working on
Todos could import a billing router or a notes schema, and lint stayed green.

The cross-feature graph was still small: 12 production import edges, most of them type imports
through `<feature>.module.ts`, for example `todos.module.ts` imports the `Billing` type. So the map
could describe reality and block new leaks before they spread.

`eslint-plugin-import` cannot do this here. The repo installs only `eslint-import-resolver-node`,
which does not resolve extensionless TypeScript imports: `import/no-unresolved` reports every
relative import in a feature file. `import/no-restricted-paths` would therefore pass silently, and
the existing `import/no-cycle` gate in `packages/config/eslint/base.js` checks nothing for TS files.

## Decision

1. **Seven bounded contexts** for `apps/api/src/features/*`: Tenancy & Access, Billing, Content,
   Files, Sync, Assistant, and Platform. Each feature folder belongs to exactly one. Each context
   lists the contexts it uses. The map lives in `packages/config/eslint/api-contexts.js` and is
   ordered so that a context comes after every context it uses, which rules out cycles.
2. **A local ESLint rule, `api/context-boundaries`**, in `packages/config/eslint/api-boundaries.js`,
   the same local-plugin pattern as `anti-slop.js`. It resolves relative specifiers with path math,
   not an import resolver. Features of one context import each other freely. A cross-context import
   needs an edge in the map and must target a public file of the other feature: `<feature>.module`
   or `<feature>.type`, unless `API_PUBLIC_FILES` names others. It checks static imports,
   `export … from`, and `import()`.
3. **Scope.** The rule applies to feature sources. Tests, `*.test-helpers.ts`, and `*.fixture.ts`
   may wire real collaborators across contexts. The composition root and shared kernel
   (`apps/api/src/*.ts`) and the `@repo/*` packages are outside the map.
4. **Gates against drift.** `api-boundaries.test.js` proves the rule with `RuleTester`, checks
   that every feature folder is mapped and the map is ordered, and checks that the `CONTEXT.md`
   Context map table matches the code map. `monorepo-alignment.test.ts` checks that ESLint applies
   the rule to feature sources and not to tests or the composition root, so a glob typo cannot turn
   the gate off.

## Alternatives considered

- `import/no-restricted-paths`: rejected for now. It needs a TypeScript resolver, and without one
  it reports nothing.
- Per-folder `no-restricted-imports` patterns: rejected. They match specifier text, so
  `../../features/billing/…` bypasses them, and each block must repeat the deep-import patterns
  because flat config replaces rule options.
- dependency-cruiser: rejected. It is a new dependency and a second config format for a rule that
  is about 100 lines of local code.
- A vitest-only import scan: rejected. It gives no editor or lint-staged feedback, which is where
  an agent sees the boundary first.
- Hexagonal layers, aggregates as classes, and CQRS inside each feature: rejected. They add
  indirection and tokens, and no evidence shows they help agents. The strategic part of DDD is the
  value here.

## Consequences

- Pros:
  - a lint error names the context, the allowed public files, and the map file to change
  - a new feature folder fails the check until someone assigns it to a context
  - `CONTEXT.md` describes the enforced map, so agents read the real boundaries
- Cons:
  - the map governs imports only: features still read other contexts' tables through
    `@repo/db/schema`, for example `todos.module.ts` reads `notesTable`
  - the rule checks relative specifiers only; `apps/api` uses no path aliases today
  - `import/no-cycle` remains a no-op for TS files until the repo adds a TypeScript resolver
