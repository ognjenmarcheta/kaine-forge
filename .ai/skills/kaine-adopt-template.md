---
name: kaine-adopt-template
description: Replace leftover upstream template identity with downstream project identity using the template adoption CLI.
argument-hint: optional template-adoption.json path
---

# Adopt Template Identity

Use this skill when turning this template repository into a downstream product repository. Adoption is separate from `initialize`; run adoption once before runtime bootstrap.

## Workflow

1. Read the current identity from `package.json`, `README.md`, `.env.example`, app metadata, Tauri metadata, translation locale files, and canonical `.ai/` sources.
2. If a config path was provided, inspect it and run:

   ```bash
   pnpm template:adopt --config <path> --write
   ```

3. If no config path was provided, run:

   ```bash
   pnpm template:adopt
   ```

   Review the dry-run output with the user, then rerun with `--write` when the resolved values are correct.

4. Run `pnpm ai:install` because adoption changes canonical `.ai/` sources.
5. Run `pnpm ai:doctor`.
6. Run `pnpm template:adopt --check`.
7. Use targeted searches for remaining active template identity and review each leftover:

   ```bash
   rg -n "Kaine Forge|kaine-forge|kaineforge|kaine_forge|com\\.kaine\\.forge" \
     --glob '!**/CHANGELOG.md' \
     --glob '!**/graphql/generated/**' \
     --glob '!apps/desktop/src-tauri/target/**' \
     --glob '!pnpm-lock.yaml' \
     --glob '!docs/superpowers/**'
   ```

## Config Shape

`template-adoption.json` must include:

```json
{
  "productName": "Acme Ops",
  "desktopIdentifier": "com.acme.ops.desktop",
  "compatibilityPolicy": "Acme Ops follows semver for public package exports and documents breaking changes in release notes.",
  "designCompatibilityPolicy": "Acme Ops treats token and component contract changes as product design decisions documented before release."
}
```

Optional fields can override derived defaults:

- `packageName`
- `repoSlug`
- `dockerImagePrefix`
- `s3Bucket`
- `webTitle`
- `mobileName`
- `mobileSlug`
- `mobileScheme` (OAuth deep-link scheme; defaults to the repo slug without dashes)
- `desktopProductName`
- `desktopWindowTitle`

## Boundaries

- Preserve internal `@repo/*` package names and imports.
- Do not rewrite changelogs, generated GraphQL artifacts, build outputs, lockfile history, dependency folders, or `.ai.local/`.
- Do not hand-edit generated assistant outputs. Change `.ai/` sources, then run `pnpm ai:install`.
- Keep intentional historical references only after documenting why they are not active template identity.
