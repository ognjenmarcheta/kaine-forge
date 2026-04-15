<!-- GENERATED FROM .ai; DO NOT EDIT DIRECTLY. Run pnpm ai:sync. -->

# Kaine Forge AI Guide

This repository is a Turborepo and pnpm monorepo template for React/Vite web, GraphQL Yoga API, Tauri desktop, Expo mobile, Drizzle/Postgres data, better-auth organizations, and shared `@repo/*` packages.

## Required Reading

- Read `MONOREPO_GUIDE.md` before generating, modifying, or reviewing code.
- Read `DESIGN_SYSTEM.md` before UI, styling, theming, token, or component work.
- Treat `MONOREPO_GUIDE.md` as authoritative for architecture, package boundaries, naming, data rules, GraphQL flow, and engineering conventions.
- Treat `DESIGN_SYSTEM.md` as authoritative for visual language, tokens, theming, and component behavior.

## Working Rules

- Work from the repo root unless a command explicitly needs a workspace directory.
- Use `pnpm --filter <workspace> <script>` for scoped commands, for example `pnpm --filter @repo/api test`.
- Keep changes surgical. Avoid broad refactors unless the task explicitly asks for them.
- Prefer tests that prove the requested behavior over snapshot churn or unrelated coverage.
- Preserve Feature-Driven Development naming: `{feature}.{purpose}.ts(x)` inside feature folders.
- Preserve `@repo/*` package boundaries. Do not import through internal package paths.
- Keep TypeScript strict. Do not use `any`; use `unknown` with narrowing when needed.
- Keep user-facing strings in translation JSON files and access them through i18n helpers.
- Use generated GraphQL operations and schema generation flow. Do not hand-edit generated GraphQL outputs.
- Keep organization-scoped data organization-scoped. Resolve active organization from session/context.
- Keep styling token-only. Use `--ds-*` tokens through the Tailwind utilities defined by the repo.
- Use `@repo/ui` for web/desktop React DOM primitives and `@repo/mobile-ui` for React Native primitives.
- Do not commit secrets or local assistant state.

## Common Commands

- Install dependencies: `pnpm install`
- Run all dev tasks: `pnpm dev`
- Generate GraphQL artifacts: `pnpm generate`
- Run full check: `pnpm check`
- Format check: `pnpm format:check`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Build API and web core: `pnpm run build:core`
- Sync AI assistant files: `pnpm ai:sync`
- Check AI assistant drift: `pnpm ai:sync:check`

## AI Behavioral Guidelines

Principles to reduce common LLM coding mistakes (adapted from Andrej Karpathy's observations):

- **Think before coding.** State assumptions explicitly. If multiple interpretations exist, present them instead of picking silently. Push back when a simpler approach exists. If something is unclear, stop and ask.
- **Simplicity first.** Write the minimum code that solves the problem. No unrequested features, no abstractions for single-use code, no speculative flexibility or error handling for impossible scenarios. If 200 lines could be 50, rewrite it.
- **Surgical changes.** Touch only what you must. Do not improve adjacent code, comments, or formatting. Match existing style. Remove imports/variables that your changes made unused, but do not remove pre-existing dead code unless asked.
- **Goal-driven execution.** Transform tasks into verifiable goals. For multi-step work, state a brief plan with verification checks. Loop until success criteria are met.

These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## AI Skills

Reusable AI workflows live in `.ai/skills/`. Run `pnpm ai:sync` after adding or editing a skill, MCP server, Serena memory, or Serena project config so Claude, Codex, Cursor, Serena, and other generated assistant files stay aligned. Generated assistant files should not be edited directly.

Use skills when they match the task:

- `sync-docs`: regenerate and verify generated assistant files.
- `test`: plan or write tests for a specified system under test.
- `open-pr`: prepare a draft PR with repo checks and template expectations.
- `rebase`: safely rebase a feature branch onto `main`.
- `fix-ci`: investigate and fix failing CI from logs and local reproduction.
- `review`: perform code-review style analysis focused on bugs, regressions, missing tests, security, and template-rule violations.

Downstream products can add more skills in `.ai/skills/` without changing this generator.

Canonical AI sources are `.ai/guide.md`, `.ai/skills/*.md`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/serena-project.yml`, and `.ai/serena-memories/*.md`.

## Generated Skills Index

- `fix-ci`: Investigate failing CI by reading logs, reproducing locally, and implementing the smallest safe fix.
- `open-pr`: Prepare a draft pull request using Kaine Forge checks, changeset rules, and GitHub flow.
- `rebase`: Safely rebase a feature branch onto main with conflict-resolution and verification rules.
- `review`: Perform code-review style analysis focused on bugs, regressions, missing tests, security, and template-rule violations.
- `sync-docs`: Regenerate and validate generated AI assistant files from canonical .ai sources.
- `test`: Write or verify tests for a specified system under test using Kaine Forge conventions.
