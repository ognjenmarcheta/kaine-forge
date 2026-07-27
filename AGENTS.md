# Kaine Forge AI Guide

This repository is a Turborepo and pnpm monorepo template for React/Vite web, GraphQL Yoga API, Tauri desktop, Expo mobile, Drizzle/Postgres data, better-auth (organization + bearer plugins) with custom scrypt password hooks, and shared `@repo/*` packages.

## Required Reading

- Read `MONOREPO_GUIDE.md` before generating, modifying, or reviewing code.
- Read `DESIGN_SYSTEM.md` before UI, styling, theming, token, or component work.
- Treat `MONOREPO_GUIDE.md` as authoritative for architecture, package boundaries, naming, data rules, GraphQL flow, and engineering conventions.
- Treat `DESIGN_SYSTEM.md` as authoritative for visual language, tokens, theming, and component behavior.
- Read `CONTEXT.md` before naming domain concepts or shaping organization-scoped APIs.
- Read `REVIEW.md` before reviewing code or when acting as a reviewer (canonical source `.ai/review.md`).
- Read `docs/agents/day-one.md` when contributing with an agent for the first time or with little repo context.

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
- Treat every top-level `Dockerfile.<app>` as a deployable app contract. The Release workflow on `main` runs `pnpm release:apps` after quality gates; use the CLI for dry-runs or repairs so only matching `release/<app>` branches move.

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
- Build the codebase knowledge graph (optional Graphify CLI): `pnpm graph`

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

### Response Framing

Open each substantive work response with a one-line focus banner so drift is visible at a glance:

🧭 **Kaine Forge** — {active task} · {workspace or branch} · {one rule that applies right now}

Example: 🧭 **Kaine Forge** — wiring password-reset emails · packages/auth · organization-scoped data, strict TS

- Use it for real work (edits, multi-step tasks, code or architecture answers), not for trivial acknowledgements or a single clarifying question — a banner on every throwaway line is noise.
- The last slot is a live reminder of a currently-relevant repo rule (token-only styling, the `@repo/*` boundary, organization-scoped data, strict TypeScript with no `any`).
- If you are unsure what the active task or branch is, put `⚠️ context unclear` in place of the banner and say what you need to re-ground. A missing or stale banner (wrong task, wrong branch) is the human's cue that focus may have been lost.
- The banner flags _intent_; it is a visibility aid, not a quality gate. `pnpm check` and code review remain the ground truth for whether the work is in-bounds.

### Dispatching Subagents

Prefer the `kaine-*` subagent types — `kaine-implementer` for changes, `kaine-explorer` for read-only research — they carry these rules in their own system prompt. When you must use a built-in `general-purpose` agent, paste the relevant Working Rules into its prompt.

A spawned subagent inherits none of this guide automatically — it sees only its task prompt. When you dispatch one for substantive work, carry the relevant parts in:

- Include the **Working Rules** that bear on its task (package boundaries, no `any`, token-only styling, organization-scoped data, i18n, generated GraphQL) — the subset that applies, not the whole guide.
- Require the same focus banner and verification close in its response, so drift is visible in subagent output too.
- Keep it proportional: a narrow read-only search agent needs the boundary rules and little else; an implementation agent needs the full relevant slice. Never dump the entire guide into a focused agent — it dilutes the task.

### Verification Before Completion

End substantive work by stating what you actually verified, not by asserting success:

- Name the checks you ran and their result — e.g. "ran `pnpm check` — green", "`pnpm --filter @repo/auth test` — 93 passing", or the exact command and output you relied on.
- If a check was skipped or could not run, say so and why. Never claim done, fixed, or passing without evidence.
- This pairs with the focus banner: the banner grounds intent at the start, the verification close confirms the result at the end. Between them, a response that opens on-task but drifts mid-way is caught by the closing evidence.

## Domain Knowledge as Infrastructure

- Prefer encoding a class of mistake once (lint, test, REVIEW checklist, skill, CONTEXT) over re-fixing the same failure in every PR or agent session.
- After a domain or template review rejection that will recur, use `kaine-encode-knowledge` to promote the lesson into durable infrastructure.
- Shared review contract lives in `REVIEW.md`, generated from `.ai/review.md` — edit the canonical source, then reinstall.
- Put product workflows in skills; use `kaine-*` for template-wide workflows. See `docs/agents/skill-authoring.md` for when and how to add skills.
- Prefer hard automation (lint, CI, tests) when a rule is proven; checklists and tests remain valid until automation is justified.
- See ADR 0009 for the full rationale and the knowledge-encoding loop.

## AI Skills

Reusable AI workflows live in `.ai/skills/`. `.ai/` is the canonical source of truth for shared guide content, skills, MCP servers, Serena seed files, and lightweight Codex/Claude/Grok session hooks. Run `pnpm ai:install` after editing `.ai/` sources so AGENTS, Claude import, Serena files, local per-agent installs, and AI setup hooks stay aligned. Supported install targets: `claude`, `codex`, `cursor`, `opencode`, `grok`. `pnpm quick-setup` and `pnpm initialize` also run `pnpm ai:install` during onboarding after dependency installation. Run `pnpm ai:doctor` to lint skills, check MCP requirements, and surface drift. Installed agent outputs should not be edited directly.

Codex, Claude, and Grok Build `SessionStart` hooks inject compact repo context at startup: repository name, branch, worktree status, and AI setup health. Hooks warn when local generated AI files look missing or stale, but they do not block work; run `pnpm ai:install --agent <agent>` and `pnpm ai:doctor` when they warn. Grok project MCP lives in `.grok/config.toml` (requires folder trust in Grok Build).

Team-managed skills must use the `kaine-` prefix. To customize a team skill, copy it to a non-prefixed name in your local agent skill directory and edit the copy. The installer updates only `kaine-*` skills and leaves your personal copies alone.

Use skills when they match the task:

- `kaine-adopt-template`: replace template identity with downstream project identity via the adoption CLI.
- `kaine-encode-knowledge`: promote repeated review/agent failures into durable infra (lint, test, REVIEW, skill, CONTEXT).
- `kaine-sync-docs`: reinstall and verify AI assistant files.
- `kaine-test`: plan or write tests for a specified system under test.
- `kaine-open-pr`: prepare a draft PR with repo checks and template expectations.
- `kaine-release-apps`: update per-app deploy branches after merge to `main`.
- `kaine-rebase`: safely rebase a feature branch onto `main`.
- `kaine-fix-ci`: investigate and fix failing CI from logs and local reproduction.
- `kaine-review`: perform code-review style analysis focused on bugs, regressions, missing tests, security, and template-rule violations.
- `kaine-triage-issue`: verify each finding in a GitHub issue against current code; fix or triage only still-valid items with minimal changes.
- `kaine-triage-deps`: triage open Dependabot/Renovate PRs—merge safe bumps, recreate conflicts, close unsafe one-offs, track intentional upgrades.
- `kaine-graph`: build and query the Graphify codebase knowledge graph for architecture and impact questions.

The `kaine-graph` skill layers an optional generated knowledge graph over the hand-written knowledge sources (Serena memories, `CONTEXT.md`, `docs/adr/`). Its `graphify-out/` output is local, regenerable, and never committed.

Downstream products can add more skills in `.ai/skills/` without changing this generator.

Canonical AI sources are `.ai/guide.md`, `.ai/skills/*.md`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/review.md`, `.ai/serena-project.yml`, and `.ai/serena-memories/*.md`. Personal MCP values and overrides live in `.ai.local/`, which is gitignored.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `ognjenmarcheta/kaine-forge` using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the canonical Matt Pocock skill labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout: root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Generated Skills Index

- `kaine-adopt-template`: Replace leftover upstream template identity with downstream project identity using the template adoption CLI.
- `kaine-encode-knowledge`: Promote a repeated review rejection or agent mistake into durable infrastructure (lint, test, REVIEW, skill, CONTEXT, or docs) so the class of issue stops being one-off busywork.
- `kaine-fix-ci`: Investigate failing CI by reading logs, reproducing locally, and implementing the smallest safe fix.
- `kaine-graph`: Build and query the Graphify codebase knowledge graph for architecture, impact analysis, and cross-layer tracing.
- `kaine-open-pr`: Prepare a draft pull request using Kaine Forge checks, changeset rules, and GitHub flow.
- `kaine-rebase`: Safely rebase a feature branch onto main with conflict-resolution and verification rules.
- `kaine-release-apps`: Update per-app release branches after merge to main so only affected Docker-backed apps redeploy.
- `kaine-review`: Perform code-review style analysis focused on bugs, regressions, missing tests, security, and template-rule violations.
- `kaine-sync-docs`: Reinstall and validate AI assistant files from canonical .ai sources.
- `kaine-test`: Write or verify tests for a specified system under test using Kaine Forge conventions.
- `kaine-triage-deps`: Triage open Dependabot or Renovate PRs against main and repo policy—merge safe bumps, recreate conflicts, close unsafe one-offs with reasons, and track intentional upgrades.
- `kaine-triage-issue`: Verify each finding in a GitHub issue against current code; fix or triage only still-valid items, skip or close the rest with a brief reason, keep changes minimal, and validate.
