# Coding And Design Standards

## Behavioral Guidelines

- Think before coding. State assumptions explicitly. If multiple interpretations exist, present them. If unclear, stop and ask.
- Simplicity first. Minimum code that solves the problem. No unrequested features, no single-use abstractions, no speculative flexibility.
- Surgical changes. Touch only what the task requires. Do not improve adjacent code, comments, or formatting. Remove only what your changes made unused.
- Goal-driven execution. Transform tasks into verifiable goals. For multi-step work, state a plan with verification checks.

## Technical Standards

- TypeScript is strict across the repo. Do not use `any`.
- Keep package boundaries clean and import through `@repo/*` exports.
- Keep changes focused on the requested behavior.
- All user-facing strings belong in translation JSON files.
- Styling must use `--ds-*` tokens through Tailwind utilities.
- Read `DESIGN_SYSTEM.md` before UI work.
- Prefer accessible primitives and token-based states over opacity hacks.
- Avoid alternative libraries for responsibilities already covered by the stack.
- Add tests when behavior, authorization, data access, GraphQL, or generated flows change.
- Treat repeated template or domain mistakes as encode candidates (`kaine-encode-knowledge`).
