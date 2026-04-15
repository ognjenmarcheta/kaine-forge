# Architecture And FDD Patterns

- `MONOREPO_GUIDE.md` is the source of truth for architecture and naming.
- Features use `{feature}.{purpose}.ts(x)` naming.
- App feature code lives under `apps/<app>/src/features/<feature>/`.
- API GraphQL features provide SDL in `<feature>.schema.ts` and resolvers in `<feature>.router.ts`.
- Shared packages expose public subpaths from `package.json`; do not import internal package files.
- User-created data is organization-scoped. Resolve active organization from the authenticated session/context.
- Web uses `@repo/ui`; mobile uses `@repo/mobile-ui`.
- Generated GraphQL artifacts are produced by `pnpm generate`; do not hand-edit generated files.
- Runtime GraphQL schema and schema generation use the same central feature registry.
- Feature flags are config-driven in `@repo/feature-flags`.
- `.ai/` is canonical for assistant guidance; generated assistant files should not be edited directly.
