---
name: kaine-create-feature
description: Scaffold an organization-scoped CRUD feature slice with the create-feature CLI, then finish the parts the generator deliberately leaves to a human.
argument-hint: singular feature name, optional plural and label
---

# Create a Feature Slice

Use this skill when adding a new organization-scoped CRUD feature to the API and web. One feature touches 33 files across five workspaces; the CLI emits 19 of them, wires the other 13 registration points, and leaves you the migration, so hand-writing the slice is the wrong default.

Do **not** use it when the feature is not organization-scoped CRUD, or when it needs mobile. `CONTEXT.md` **Template platform surfaces** makes mobile a deliberate subset — the generator has no mobile mode on purpose. Fall back to the manual steps in `MONOREPO_GUIDE.md` section 19.

## Workflow

1. Use names already supplied or approved by the user; ask only when the task leaves names ambiguous. The singular drives the GraphQL type and event names; the plural drives the table, folder, route, and translation namespace. Both must be lowercase kebab-case, and they must differ.

2. Preview first. This writes nothing:

   ```bash
   pnpm create:feature <singular> --plural <plural>
   ```

   Pass `--label "<Text>"` when the navigation label is not the Title Case of the plural.

3. Apply it:

   ```bash
   pnpm create:feature <singular> --plural <plural> --write
   ```

   The CLI writes the files, runs prettier and `eslint --fix` over them, then runs `pnpm generate`. It refuses to start — with no partial writes — when a scaffold path exists, a wiring anchor moved, or the name is already registered.

4. Replace the placeholder columns. Every slice starts with `title varchar(255) NOT NULL` and `body text` (ceiling tracked in issue #383). Edit `packages/db/src/schema/{plural}.schema.ts` to the real shape, then match:
   - `apps/api/src/features/{plural}/{plural}.type.ts`, `.util.ts`, and `.module.ts`
   - the SDL in `apps/api/src/features/{plural}/{plural}.schema.ts`
   - `apps/web/src/graphql/operations/{plural}.graphql`
   - the two web routes

   Then re-run `pnpm generate`.

5. Only once the columns are final:

   ```bash
   pnpm db:generate
   ```

   Review the emitted `packages/db/drizzle/*.sql`. Never edit a migration that already shipped — add a new one. The generated `{plural}.module.test.ts` runs on PGlite, which replays every migration, so it fails with `relation "{plural}" does not exist` until this step is done.

6. Translate `packages/translation/src/locales/de/{plural}.json`, `.../sr/{plural}.json`, and the `navigation.{plural}` key in both. The generator writes English placeholders. `locale-consistency.test.ts` rejects values identical to English, so `pnpm check` fails until translation is complete. Add a locale/key exception only for a term that is legitimately identical in both languages; stale exceptions also fail.

7. Verify, in this order:

   ```bash
   pnpm check
   ```

   Then `pnpm db:push:local` and `pnpm test:e2e` for explicitly opted-in local PostgreSQL (`ALLOW_LOCAL_DB_PUSH=true`). Shared and deployed databases use reviewed migrations.

## Rules the generated slice already satisfies

Do not "improve" these — they are the contract `.ai/create-feature.util.spec.ts` asserts:

- The feature is one deep module, `create{Plural}` in `{plural}.module.ts`, on the request context as `ctx.{plural}`. It reads and writes only through `ScopedData` (`ctx.data`), which adds the organization predicate; no file imports the `db` singleton.
- The list field returns `{Singular}Connection` (`items` plus the shared `pageInfo`) and takes `first` and `after`. `list` builds its page with `data.page(...)`, which keeps the organization predicate and refuses a malformed or foreign cursor with `invalid cursor`; the list route pages with `useInfiniteQuery` after `pageInfo.endCursor`. Keep the `createdAt` order and `id` tie breaker when you replace the columns. `MONOREPO_GUIDE.md` **List fields and cursors** states the contract.
- Resolvers only call `ctx.{plural}`. Subscriptions come from `organizationSubscriptions([...])`, whose fields the wiring adds to `ORGANIZATION_SUBSCRIPTIONS` in `apps/api/src/pubsub.ts`.
- The module test runs on PGlite through `createTestDatabase()` from `@repo/db/testing` and proves that another Organization's rows stay unreadable and unchanged. It does not mock `@repo/db`.
- Web routes subscribe through `useLive{Plural}` in `apps/web/src/hooks/use-live-list.ts`, which uses the generated `On*Document` subscriptions — never a subscription string.
- `Create*Input` and `Update*Input` carry no `organizationId`. A client-supplied organization id is an anti-pattern.
- Web query keys go through `createActiveOrganizationQueryKey` from `@repo/query`.
- The UI uses `@repo/ui` primitives and `--ds-*` tokens only, and every string goes through `t()`.

## Reporting

State which names you used, that `pnpm check` passed, and which of steps 4-6 the user still owns — the columns, the migration, and the two untranslated locales.
