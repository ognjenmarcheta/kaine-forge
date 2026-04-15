---
description: Kaine Forge monorepo rules
alwaysApply: true
---

# Kaine Forge Cursor Rules

This is the canonical source for Cursor rules. Edit here, then run `pnpm ai:sync`.

Before code changes:

- Read `MONOREPO_GUIDE.md`.
- Read `DESIGN_SYSTEM.md` for UI, styling, theming, tokens, or component work.
- Prefer `.ai/guide.md` and generated `AGENTS.md` for assistant workflow guidance.

Core constraints:

- Work from the repository root.
- Use `pnpm --filter <workspace> <script>` for scoped commands.
- Preserve FDD naming and `@repo/*` package boundaries.
- Keep generated GraphQL flow intact.
- Keep user-facing strings in translation files.
- Use design tokens only for styling.
- Keep strict TypeScript and avoid `any`.
- Run `pnpm ai:sync` after editing `.ai/` sources.
