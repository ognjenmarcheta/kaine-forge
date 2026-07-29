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

- Think before coding. Restate multi-part goals, state assumptions, inspect relevant files/tests, and ask when guessing would change behavior.
- Simplicity first. Write the minimum code that solves the problem; avoid speculative features, abstractions, and new patterns.
- Surgical changes. Touch only necessary files, match existing style, remove only unused code created by your change, and edit canonical sources before generated outputs.
- Goal-driven execution. Define verifiable success criteria, choose checks that prove behavior, and loop until met or a blocker is explicit.

Core constraints:

- Work from the repository root.
- Use `pnpm --filter <workspace> <script>` for scoped commands.
- Preserve FDD naming and `@repo/*` package boundaries.
- Keep generated GraphQL flow intact.
- Keep user-facing strings in translation files.
- Use design tokens only for styling.
- Keep strict TypeScript and avoid `any`.
- Never co-author yourself or any AI/tool identity in commits (no AI `Co-Authored-By` trailers or generator footers; commitlint enforces this).
- Run `pnpm ai:install` after editing `.ai/` sources.
- `pnpm quick-setup` and `pnpm initialize` install AI assistant files during onboarding.
