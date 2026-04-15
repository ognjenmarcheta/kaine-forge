<!-- GENERATED FROM .ai; DO NOT EDIT DIRECTLY. Run pnpm ai:sync. -->

# Coding And Design Standards

- TypeScript is strict across the repo. Do not use `any`.
- Keep package boundaries clean and import through `@repo/*` exports.
- Keep changes focused on the requested behavior.
- All user-facing strings belong in translation JSON files.
- Styling must use `--ds-*` tokens through Tailwind utilities.
- Read `DESIGN_SYSTEM.md` before UI work.
- Prefer accessible primitives and token-based states over opacity hacks.
- Avoid alternative libraries for responsibilities already covered by the stack.
- Add tests when behavior, authorization, data access, GraphQL, or generated flows change.
