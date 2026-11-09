# ADR 0026: API table ownership and kernel direction

- Status: Accepted
- Date: 2026-11-09
- Applies to: `apps/api/src/features/**`, `apps/api/src/*.ts`, `apps/api/src/middleware/**`, `packages/config/eslint/api-contexts.js`, `packages/config/eslint/api-boundaries.js`

## Context

ADR 0025 maps the API features to seven bounded contexts and checks their imports. It left two
paths open:

- Tables. Any feature could import any `@repo/db/schema` table and query another context's rows
  directly, past that context's module. A scan of the feature sources found four features that
  read another context's tables: `storage`, `sync`, `data-export`, and `housekeeping`. All four do
  it on purpose, but nothing recorded it, and a fifth would pass lint.
- The shared kernel. ADR 0025 put `apps/api/src/*.ts` outside the map, composition roots and
  kernel alike. `pubsub.ts`, which every feature imports, imported a type from the notifications
  feature, so the kernel and a feature depended on each other.

## Decision

1. **Every table has one owner.** Each `API_CONTEXTS` entry in
   `packages/config/eslint/api-contexts.js` lists the tables it owns. `API_AUTH_TABLES` lists the
   tables better-auth owns (`@repo/auth`). Like the package, they are outside the map, and every
   feature may import them.
2. **A feature imports its own context's tables.** `api/context-boundaries` checks every named
   value import from `@repo/db` and `@repo/db/schema` whose name ends in `Table`. Another
   context's table needs an entry in `API_FOREIGN_TABLES` for the importing feature, with a
   reason. A `uses` edge alone does not open a table: the edge opens the other context's public
   module. A table in no list fails lint, so a new table must be mapped before a feature imports
   it. A namespace import of the schema fails, because it hides which tables the file uses.
   Type-only imports run no query and pass.
3. **The kernel imports no feature.** The rule also applies to the shared kernel: the
   `apps/api/src/*.ts` files and `apps/api/src/middleware/**`, except the composition roots
   (`context.ts`, `context.loaders.ts`, `server.ts`, `index.ts`, `worker.ts`, `api.jobs.ts`, and
   `schema/`). A kernel file that imports a feature fails lint. The notification payload types
   moved into `pubsub.ts`, next to the other event payloads.
4. **Gates.** `api-boundaries.test.js` proves each case with `RuleTester` and checks that each table
   has one owner and that `API_FOREIGN_TABLES` names only mapped features and tables.
   `monorepo-alignment.test.ts` checks that ESLint applies the rule to a kernel file and not to a
   composition root.

## Alternatives Considered

- One Postgres schema per context: rejected. It moves every table and its migrations for a rule
  that lint can check, and better-auth expects its tables in one schema.
- Opening a table along every `uses` edge: rejected. It would let `storage` read any Content table,
  and the reason for each foreign read would stay unrecorded.
- Moving the foreign reads behind the owners' modules now: rejected for this change. Retention in
  `housekeeping` and the export in `data-export` read many contexts by design. The allowlist
  records each read and blocks new ones; moving a read into its owner's module stays possible later.

## Consequences

- Pros:
  - a new direct read of another context's table fails lint with the owner's name and the fix
  - the reasons for the four existing foreign reads are in the map, next to the tables
  - the kernel stays below the features, so a kernel change cannot pull in a feature
- Cons:
  - the rule matches table imports by the `Table` suffix; a table exported under another name is
    not checked
  - a table passed in as a value, or reached through another module's query helper, is not checked
  - better-auth's tables stay open to every feature
