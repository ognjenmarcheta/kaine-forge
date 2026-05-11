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
- Treat every top-level `Dockerfile.<app>` as a deployable app contract. After changes that affect a deployable app reach `main`, run `pnpm release:apps` so only the matching `release/<app>` branches move.

## Common Commands

- Install dependencies: `pnpm install`
- Run onboarding bootstrap: `pnpm quick-setup`
- Run all dev tasks: `pnpm dev`
- Generate GraphQL artifacts: `pnpm generate`
- Run full check: `pnpm check`
- Format check: `pnpm format:check`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Build API and web core: `pnpm run build:core`
- Update deployable app release branches: `pnpm release:apps`
- Install local AI assistant files: `pnpm ai:install`
- Check AI assistant setup and drift: `pnpm ai:doctor`

## AI Behavioral Guidelines

Principles to reduce common LLM coding mistakes (adapted from Andrej Karpathy's observations and related agent workflow guidance):

### Think Before Coding

- Restate the goal in concrete terms before editing when the request has multiple moving parts.
- State assumptions explicitly. If two interpretations would produce different code, surface the fork instead of choosing silently.
- Read the relevant existing files and tests first. Let the current architecture, naming, and package boundaries shape the change.
- Push back when the requested path is likely to be more complex than needed, and offer the simpler alternative with tradeoffs.
- If a required fact cannot be discovered locally and guessing would change behavior, stop and ask.

### Simplicity First

- Write the minimum code that solves the stated problem.
- Avoid unrequested features, speculative options, broad abstractions, and error handling for impossible states.
- Prefer existing helpers and conventions over new frameworks, new patterns, or one-off infrastructure.
- If a direct implementation is clearer than a generic abstraction, keep it direct.
- If a solution is growing large, pause and look for the smaller design before continuing.

### Surgical Changes

- Touch only the files needed for the requested outcome.
- Preserve existing style, naming, file layout, imports, and formatting outside the changed lines.
- Do not improve adjacent code, comments, tests, or docs unless that work is required for the task.
- Remove imports, variables, and helper code that your change made unused. Do not remove pre-existing dead code unless asked.
- Keep generated files in their normal flow. Edit canonical sources, then run the generator.

### Goal-Driven Execution

- Convert the request into verifiable goals and use those goals to choose tests and checks.
- For multi-step work, state a brief plan with the verification for each meaningful step.
- Prefer behavioral proof over implementation trivia. A good check proves the user-visible or contract-level result.
- Examples of verifiable goals:
  - "When `--mcp context7` is selected, compatible personal MCPs still appear in the generated agent config."
  - "When one MCP is skipped for missing env, the warning lists only env vars needed by that skipped MCP."
  - "After editing canonical `.ai/` sources, `pnpm ai:install` updates generated assistant outputs and `pnpm ai:doctor` reports no drift."
- Loop until the success criteria are met or a blocker is made explicit.

These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## AI Skills

Reusable AI workflows live in `.ai/skills/`. `.ai/` is the canonical source of truth for shared guide content, skills, MCP servers, Serena seed files, and lightweight Codex/Claude session hooks. Run `pnpm ai:install` after editing `.ai/` sources so AGENTS, Claude import, Serena files, local per-agent installs, and AI setup hooks stay aligned. `pnpm quick-setup` and `pnpm initialize` also run `pnpm ai:install` during onboarding after dependency installation. Run `pnpm ai:doctor` to lint skills, check MCP requirements, and surface drift. Installed agent outputs should not be edited directly.

Codex and Claude `SessionStart` hooks inject compact repo context at startup: repository name, branch, worktree status, and AI setup health. Hooks warn when local generated AI files look missing or stale, but they do not block work; run `pnpm ai:install --agent <agent>` and `pnpm ai:doctor` when they warn.

Team-managed skills must use the `kaine-` prefix. To customize a team skill, copy it to a non-prefixed name in your local agent skill directory and edit the copy. The installer updates only `kaine-*` skills and leaves your personal copies alone.

Use skills when they match the task:

- `kaine-sync-docs`: reinstall and verify AI assistant files.
- `kaine-test`: plan or write tests for a specified system under test.
- `kaine-open-pr`: prepare a draft PR with repo checks and template expectations.
- `kaine-release-apps`: update per-app deploy branches after merge to `main`.
- `kaine-rebase`: safely rebase a feature branch onto `main`.
- `kaine-fix-ci`: investigate and fix failing CI from logs and local reproduction.
- `kaine-review`: perform code-review style analysis focused on bugs, regressions, missing tests, security, and template-rule violations.

Downstream products can add more skills in `.ai/skills/` without changing this generator.

Canonical AI sources are `.ai/guide.md`, `.ai/skills/*.md`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/serena-project.yml`, and `.ai/serena-memories/*.md`. Personal MCP values and overrides live in `.ai.local/`, which is gitignored.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `ognjenmarcheta/kaine-forge` using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the canonical Matt Pocock skill labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout: root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.
