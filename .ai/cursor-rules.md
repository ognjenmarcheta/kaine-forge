---
description: Kaine Forge monorepo rules
alwaysApply: true
---

# Kaine Forge Cursor Rules

This is the canonical source for Cursor rules. Edit here, then run `pnpm ai:install`.

Before code changes:

- Read `MONOREPO_GUIDE.md`.
- Read `DESIGN_SYSTEM.md` for UI, styling, theming, tokens, or component work.
- Prefer `.ai/guide.md` and generated `AGENTS.md` for assistant workflow guidance.

Behavioral guidelines:

- Think before coding. State assumptions explicitly. If unclear, ask before implementing.
- Simplicity first. Minimum code that solves the problem. No speculative features or abstractions.
- Surgical changes. Touch only what you must. Do not improve adjacent code unless asked.
- Goal-driven execution. Define verifiable success criteria. Loop until met.

Core constraints:

- Work from the repository root.
- Use `pnpm --filter <workspace> <script>` for scoped commands.
- Preserve FDD naming and `@repo/*` package boundaries.
- Keep generated GraphQL flow intact.
- Keep user-facing strings in translation files.
- Use design tokens only for styling.
- Keep strict TypeScript and avoid `any`.
- Run `pnpm ai:install` after editing `.ai/` sources.
