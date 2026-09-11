---
name: kaine-create-feature
description: Scaffold an organization-scoped CRUD feature slice with the create-feature CLI, then finish the parts the generator deliberately leaves to a human.
argument-hint: singular feature name, optional plural and label
---

# Create a Feature Slice

Use this skill when adding a new organization-scoped CRUD feature to the API and web. One feature touches 34 files across five workspaces; the CLI emits 22 of them and wires the other 11 registration points, so hand-writing the slice is the wrong default.

Do **not** use it when the feature is not organization-scoped CRUD, or when it needs mobile. `CONTEXT.md` **Template platform surfaces** makes mobile a deliberate subset — the generator has no mobile mode on purpose. Fall back to the manual steps in `MONOREPO_GUIDE.md` section 19.

## Workflow

1. Agree the names with the user before writing anything. The singular drives the GraphQL type and event names; the plural drives the table, folder, route, and translation namespace. Both must be lowercase kebab-case, and they must differ.

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
   - `apps/api/src/features/{plural}/{plural}.type.ts` and `.util.ts`
   - the SDL in `apps/api/src/features/{plural}/{plural}.schema.ts`
   - `apps/web/src/graphql/operations/{plural}.graphql`
   - the two web routes

   Then re-run `pnpm generate`.

5. Only once the columns are final:

   ```bash
   pnpm db:generate
   ```

   Review the emitted `packages/db/drizzle/*.sql`. Never edit a migration that already shipped — add a new one.

6. Translate `packages/translation/src/locales/de/{plural}.json`, `.../sr/{plural}.json`, and the `navigation.{plural}` key in both. They ship English copy; `locale-consistency.test.ts` compares keys, not values, so nothing else will catch it (issue #382).

7. Verify, in this order:

   ```bash
   pnpm check
   ```

   Then `pnpm db:push` and `pnpm test:e2e` when a database is available.

## Rules the generated slice already satisfies

Do not "improve" these — they are the contract `.ai/create-feature.util.spec.ts` asserts:

- Every adapter function takes `AuthenticatedOrganizationScope` and filters on `scope.organizationId`.
- Every resolver opens with `ctx.requireOrganizationScope()`; every subscription pipes through `filterByOrganization`.
- `Create*Input` and `Update*Input` carry no `organizationId`. A client-supplied organization id is an anti-pattern.
- Web query keys go through `createActiveOrganizationQueryKey` from `@repo/query`.
- The UI uses `@repo/ui` primitives and `--ds-*` tokens only, and every string goes through `t()`.

## Reporting

State which names you used, that `pnpm check` passed, and which of steps 4-6 the user still owns — the columns, the migration, and the two untranslated locales.
