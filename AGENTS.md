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
- Keep TypeScript strict. Do not use `any`; use `unknown` only at intake boundaries and narrow it immediately. Do not put `unknown` in exported params/returns (error `cause` excepted) or dictionary value types outside true serialization seams.
- Keep user-facing strings in translation JSON files and access them through i18n helpers.
- Use generated GraphQL operations and schema generation flow. Do not hand-edit generated GraphQL outputs.
- Keep organization-scoped data organization-scoped. Resolve active organization from session/context.
- Keep styling token-only. Use `--ds-*` tokens through the Tailwind utilities defined by the repo.
- Use `@repo/ui` for web/desktop React DOM primitives and `@repo/mobile-ui` for React Native primitives.
- Do not commit secrets or local assistant state.
- Only the repository owner may merge into `main`, manually after required checks pass. Agents and bots may propose changes and create PRs, but must not merge, approve PRs on the owner's behalf, enable automatic merging, or bypass branch protection through CLI, API, or browser actions.
- Never co-author yourself (or any AI/tool identity) in git history: no `Co-Authored-By:` trailers for assistants, no “Generated with …” / “Made with …” AI footers, and do not set commit author/committer to an AI name or noreply AI email. Commits remain under the human contributor’s identity only. The `commit-msg` hook enforces this via commitlint.
- Treat every top-level `Dockerfile.<app>` as a deployable app contract. The Release workflow on `main` runs `pnpm release:apps` after quality gates; manual CLI dry-runs and repairs belong to a human operator because agent policy blocks `release:apps`, including `--dry-run`.

## Common Commands

- Install dependencies: `pnpm install`
- Run onboarding bootstrap: `pnpm quick-setup`
- Run all dev tasks: `pnpm dev`
- Generate GraphQL artifacts: `pnpm generate`
- Run full check: `pnpm check`
- Run only what your branch touched: `pnpm check:affected` (omits `boundaries` and `knip`, which are whole-graph)
- Format check: `pnpm format:check`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Smoke the API, including the two-organization tenancy proof (no Docker, no browser): `pnpm smoke`
- Build API and web core: `pnpm run build:core`
- Deployable app release branches: the Release workflow updates them; manual `pnpm release:apps` is a human operation.
- Install local AI assistant files: `pnpm ai:install`
- Check AI assistant setup and drift: `pnpm ai:doctor`
- Build the codebase knowledge graph (optional Graphify CLI): `pnpm graph`

## AI Behavioral Guidelines

Principles to reduce common LLM coding mistakes:

### Think Before Coding

- Explicit task authorization satisfies workflow confirmation steps, including names supplied in the task. Ask only for missing information that changes behavior or a concrete action outside the authorized scope. Name and quote any skill instruction that requires a stop.
- Local setup may use `pnpm db:prepare:local` and feature work may use `pnpm db:push:local` after explicit `ALLOW_LOCAL_DB_PUSH=true` opt-in. These commands validate a loopback PostgreSQL target before mutation. Unrestricted `pnpm db:push` remains denied; shared and deployed databases use reviewed migrations.

- Restate the goal in concrete terms before editing when the request has multiple moving parts.
- State assumptions explicitly. If two interpretations would produce different code, surface the fork instead of choosing silently.
- Read the relevant existing files and tests first. Let the current architecture, naming, and package boundaries shape the change.
- Push back when the requested path is likely to be more complex than needed, and offer the simpler alternative with tradeoffs.
- Fix bugs at the root cause: a report names a symptom. Trace every caller of the function you change and fix the shared function once — one guard there beats one per caller, and patching only the reported path leaves sibling callers broken.
- If a required fact cannot be discovered locally and guessing would change behavior, stop and ask.

### Simplicity First

The best code is the code never written. Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does the monorepo already have the helper, util, or pattern? Reuse it — check the feature folder and `@repo/*` packages first.
3. Does the standard library cover it?
4. Does the platform (browser, React Native, Node) cover it?
5. Does an already-installed dependency cover it?
6. Can it be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the task and the code it touches, trace the real flow end to end, then climb. The smallest change in the wrong place is not simple — it is a second bug.

- Avoid unrequested features, speculative options, broad abstractions, and error handling for impossible states.
- If a direct implementation is clearer than a generic abstraction, keep it direct.
- If a solution is growing large, pause and look for the smaller design before continuing.
- When two same-size approaches differ in edge-case correctness, pick the correct one — simplicity means less code, not a flimsier algorithm.
- Minimalism never cuts: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, or anything explicitly requested. Non-trivial logic still ships with a test at the nearest useful layer.
- A deliberate simplification with a known ceiling gets a GitHub issue naming the ceiling and the upgrade trigger — never a "for now" comment.

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

### Stop Conditions

- If the same failing command is rerun twice in one session without a new hypothesis, stop. Capture the root cause and change strategy (different command, smaller repro, or ask).
- Do not push or mark a PR ready for review while required gates are red. Use the day-one validation tiers (`docs/agents/day-one.md`): `pnpm check:affected` while iterating, `pnpm check` before a PR.

These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### Anti-Patterns

Do not:

- Accept a client-supplied organization id for organization-scoped reads/writes — use **Authenticated Organization Scope** / active organization from session.
- Hand-edit generated GraphQL outputs — edit sources, then `pnpm generate`.
- Import through deep/internal package paths — use `@repo/*` public exports only.
- Hardcode colors/spacing or put user-facing strings outside translation JSON.
- Edit already-shipped migration files in place — add a new migration; preserve load-bearing order (`docs/troubleshooting.md`, ADR 0008).
- Attribute commits or PRs to an AI/tool identity (`Co-Authored-By` for assistants, “Generated with …” footers, AI as author/committer).
- Invent mobile UI/GraphQL parity for web-first features unless the task requires it (`CONTEXT.md` Template platform surfaces).
- Launder types through assertions (`x as unknown as T`, widen-then-assert) or assert without a `// SAFETY:` comment stating the checked invariant — the `anti-slop/*` ESLint rules block both; refactor toward narrowing, `satisfies`, or boundary parsing instead.

### Human-facing prose (ASD-STE100 style)

When giving the human instructions, explaining something to them, or asking clarifying questions, write in ASD-STE100-style Simplified Technical English:

- Prefer short sentences. Prefer active voice. Prefer one action or one idea per sentence.
- Prefer simple present and imperative forms. When a step is required, say so directly (avoid vague “should / could / might” when you mean must or do).
- Keep the wording concrete. Avoid filler and stacked abstractions.

**Exemptions — keep these as-is:**

- Source code, identifiers, paths, shell commands, and generated artifacts
- Commit messages and PR titles (follow repo commit conventions)
- Domain terms from `CONTEXT.md` (and other required domain docs). Use the glossary term even when it is multi-word or specialized. Do not replace it with a synonym the glossary forbids.

This rule does **not** force STE on all final outputs (code review depth, long architectural notes, or internal agent scratch work). It applies to human-facing instructions, explanations, and clarifying questions.

Always read `CONTEXT.md` (and domain docs under `docs/agents/domain.md`) before naming product concepts, and use that ubiquitous language.

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

A spawned subagent does receive this guide — `CLAUDE.md` imports it, and the `2026-09-11` harness-eval run confirmed the behaviour: `general-purpose` trials produced the focus banner and the repo's own anti-pattern language with zero tool calls, so they could not have read it from disk. The injection is frozen at session start, so an edit made mid-session reaches no agent dispatched afterwards. What carrying rules into the prompt buys is emphasis, not presence: with the verification close pasted in, 3 of 3 trials produced a red-green proof against 1 of 3 without it. Carry the relevant parts in for that reason:

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

- `kaine-adopt-template`: Replace leftover upstream template identity with downstream project identity using the template adoption CLI.
- `kaine-create-feature`: Scaffold an organization-scoped CRUD feature slice with the create-feature CLI, then finish the parts the generator deliberately leaves to a human.
- `kaine-encode-knowledge`: Promote a repeated review rejection or agent mistake into durable infrastructure (lint, test, REVIEW, skill, CONTEXT, or docs) so the class of issue stops being one-off busywork.
- `kaine-fix-ci`: Investigate failing CI by reading logs, reproducing locally, and implementing the smallest safe fix.
- `kaine-graph`: Build and query the Graphify codebase knowledge graph for architecture, impact analysis, and cross-layer tracing.
- `kaine-harness-eval`: Measure whether a specific guide or agent-definition rule actually changes agent output, and record the verdict in the harness-eval ledger.
- `kaine-open-pr`: Prepare a draft pull request using Kaine Forge checks, changeset rules, and GitHub flow.
- `kaine-rebase`: Safely rebase a feature branch onto main with conflict-resolution and verification rules.
- `kaine-release-apps`: Update per-app release branches after merge to main so only affected Docker-backed apps redeploy.
- `kaine-review`: Perform code-review style analysis focused on bugs, regressions, missing tests, security, performance, and template-rule violations.
- `kaine-scorecard`: Scan the monorepo, score it on ten health dimensions against evidence, render a visual dashboard, and file evidence-verified must-fix findings as GitHub issues.
- `kaine-secret-scan`: Run a full-history gitleaks secret scan and triage its findings before history becomes more visible.
- `kaine-simplify`: Review a diff or audit the repo for over-engineering only — what to delete, replace with stdlib/platform features, or shrink. Use when asked "is this over-engineered", "what can we delete", "simplify review", "find bloat", or "audit for over-engineering".
- `kaine-sync-docs`: Reinstall and validate AI assistant files from canonical .ai sources.
- `kaine-test`: Write or verify tests for a specified system under test using Kaine Forge conventions.
- `kaine-triage-deps`: Triage open Dependabot PRs against main and repo policy—prepare safe bumps for owner review, recreate conflicts, close unsafe one-offs with reasons, and track intentional upgrades.
- `kaine-triage-issue`: Verify each finding in a GitHub issue against current code; fix or triage only still-valid items, skip or close the rest with a brief reason, keep changes minimal, and validate.

The `kaine-graph` skill layers an optional generated knowledge graph over the hand-written knowledge sources (Serena memories, `CONTEXT.md`, `docs/adr/`). Its `graphify-out/` output is local, regenerable, and never committed.

The `kaine-scorecard` skill tracks repo-level health over time in `docs/agents/monorepo-scorecard.md`, which is the tracked source of truth for band descriptors, scores, finding slugs, and calibration notes. `pnpm scorecard` regenerates that file's marker region and writes `scorecard-out/`, which is local, regenerable, and never committed. `REVIEW.md` governs diffs; the scorecard governs the repo.

Downstream products can add more skills in `.ai/skills/` without changing this generator.

Canonical AI sources are `.ai/guide.md`, `.ai/skills/*.md`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/review.md`, `.ai/serena-project.yml`, and `.ai/serena-memories/*.md`. Personal MCP values and overrides live in `.ai.local/`, which is gitignored.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `ognjenmarcheta/kaine-forge` using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the canonical skill triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout: root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Guarded Commands

Enforced by `.ai/hooks/pre-tool-use.mjs` from `.ai/permissions.json`. `deny` is
blocked on every agent that honours a blocking hook. `ask` is a real
verdict on Claude and Cursor and degrades to an advisory elsewhere, so treat the deny tier
as the guarantee.

- **deny** `pnpm db:push` — Unrestricted schema push can drop columns in DATABASE_URL. Shared and deployed databases require pnpm db:generate and reviewed migrations. The local wrapper requires explicit opt-in and validates loopback PostgreSQL. Use `pnpm db:push:local` instead.
- **deny** `pnpm clean-deps` — Removes every node_modules directory in the tree. Use `pnpm clean` instead.
- **deny** `pnpm release:apps` — Moves release/<app> branches, which triggers deploys. The Release workflow owns this on main after merge.
- **deny** `git ... --no-verify` — Bypasses commitlint, the AI-attribution gate, and the pre-push typecheck. Fix the hook failure instead of skipping it.
- **ask** `pnpm db:seed` — Rewrites the seed user's credential row in whatever DATABASE_URL points at.
- **ask** `pnpm db:migrate` — Applies migrations to whatever DATABASE_URL points at.
- **ask** `pnpm reinstall-deps` — Wraps clean-deps and reinstalls the whole workspace.
- **ask** `git push ... --force` — Destructive on a shared branch. kaine-rebase needs it, so it asks rather than denies. --force-with-lease is unaffected.
- **ask** `git push ... -f` — Short form of --force.
- **ask** `git reset --hard` — Discards uncommitted work irrecoverably.
- **deny** `gh pr merge` — Only the repository owner merges manually. Agents may create PRs but must not merge them or enable automatic merging.
- **deny** `gh pr review ... --approve` — The repository owner reviews and approves contributions. Agents must not approve on the owner's behalf.
