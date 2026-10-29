# Kaine Forge AI Guide

This repository is a Turborepo and pnpm monorepo template for React/Vite web, GraphQL Yoga API, Tauri desktop, Expo mobile, Drizzle/Postgres data, better-auth (organization + bearer plugins) with custom scrypt password hooks, and shared `@repo/*` packages.

## Required Reading

- Read `MONOREPO_GUIDE.md` before generating, modifying, or reviewing code.
- Read `DESIGN_SYSTEM.md` before UI, styling, theming, token, or component work. For a screen, also read `docs/ui/guidelines.md` and the active theme's `DESIGN.md` (the root `DESIGN.md` for the default theme).
- Treat `MONOREPO_GUIDE.md` as authoritative for architecture, package boundaries, naming, data rules, GraphQL flow, and engineering conventions.
- Treat `DESIGN_SYSTEM.md` as authoritative for tokens, theming, and component behavior, and `docs/ui/guidelines.md` for the UI rules and their precedence. A theme's look lives in its `DESIGN.md` under `packages/theme/src/themes/`.
- Read `CONTEXT.md` before naming domain concepts or shaping organization-scoped APIs.
- Read `REVIEW.md` before reviewing code or when acting as a reviewer (canonical source `.ai/review.md`).
- Read `docs/agents/day-one.md` when contributing with an agent for the first time or with little repo context.
- Read `docs/agents/agent-desk.md` before you run, change, or explain the agent desk.

## Working Rules

- Work from the repo root unless a command explicitly needs a workspace directory.
- Name new work branches `KAINE-<issue-number>-<type>-<description>`, or `KAINE-<type>-<description>` when no GitHub issue exists. Keep `KAINE` uppercase; use a Conventional Commit type and a short lowercase, hyphen-separated description. Use a real issue number when available; do not create an issue just for naming. No agent names, personal prefixes, spaces, or slashes. Preserve existing branch names, automation-owned `dependabot/*`, `changeset-release/*`, and `release/<app>` names, and GitButler's own `gitbutler/workspace` and `gitbutler/target`. Follow `CONTRIBUTING.md` Branch names and `kaine-open-pr` for the full workflow.
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
- Pull upstream template AI setup changes into an adopted project: `pnpm ai:sync` (`--check` reports only)
- Build the codebase knowledge graph (optional Graphify CLI): `pnpm graph`; check its freshness: `pnpm graph:status`
- Run the local agent desk (UI): `pnpm desk:run`; check its setup: `pnpm desk doctor`

## Agent Desk

The agent desk (`@repo/desk` in `tooling/desk`, `@repo/desk-ui` in `tooling/desk-ui`) is the local software factory of this repository. It drives one GitHub issue through intake, plan, build, check, and review to a draft PR. The owner approves at the plan gate and the PR-review gate, and merges every PR. The manual is `docs/agents/agent-desk.md`; its "Get started" section is the first-run path.

- When the user asks to run the factory or the desk, or to hand an issue to agents end to end, start the desk with `pnpm desk:run --no-open` as a background command. Give the user the `Agent desk:` URL that it prints. On a new machine, run `pnpm desk doctor` first and report its errors.
- Inside a desk run, the prompt supplies a result schema. Fill the schema. Do not commit, push, or open a PR: the desk engine owns those steps.
- In an interactive session, do not edit an issue worktree that a desk run drives. Check with `pnpm desk status <n>`.
- The earlier software factory and its `@repo/factory-ui` dashboard were removed. ADR 0011 records why. Do not restore them.

## Version Control with GitButler

GitButler is the recommended local version-control client. It runs several branches in one checkout, so parallel agent sessions do not need a worktree each. Docs: https://docs.gitbutler.com/ai-agents/getting-started.

- When `git branch --show-current` prints `gitbutler/workspace`, use the `but` CLI for every write: commit, branch, amend, absorb, squash, move, push, pull, and pull requests. Do not run `git add`, `git commit`, `git switch`, `git checkout`, `git rebase`, `git stash`, `git merge`, `git cherry-pick`, or `git push` there. Read-only git (`git log`, `git blame`, `git show`) is fine. On any other branch, use plain git.
- Use one GitButler branch for each agent session. Name it with the branch rule above and pass it every time: `but commit -b KAINE-<n>-<type>-<description> -m "<message>" <ids>`. Without `-b`, GitButler generates a name. Always pass `-m` so no editor opens.
- Commit only the changes that belong to your session. Select them by file or hunk ID from `but diff`. Do not move, amend, squash, discard, or push another session's branch.
- Put a dependent change on a stacked branch (`but branch new <name> -A <parent>`). Amend a small fix into its unpublished commit (`but absorb`, `but amend`). Ask before you rewrite pushed or reviewed history. Recover with `but undo` or `but oplog`.
- Use `--json` for output that you parse. Add `--status-after` only when the next step needs the new IDs.
- Update from `main` with `but pull`. Resolve conflicts with `but resolve`.
- Open pull requests with `but pr new <branch> --draft -F <message-file>`. It pushes the branch and its stack ancestors and sets the stack bases. Never run `but land` or `but pr auto-merge`: only the owner merges.
- `but commit` does not run the `commit-msg` hook. The `pre-push` hook runs commitlint, including the no-AI-co-author rule, on every pushed commit, but GitButler runs `.husky` hooks only when the project setting "Enable Husky hooks" is on. It is off by default. Before `but push` or `but pr new`, run `pnpm exec commitlint --from origin/main --to <branch>` yourself. Wrap commit body lines at 100 characters.
- Each contributor installs GitButler's own agent skill: `but skill install --global` the first time, then `but skill install --detect` after a CLI update (`--detect` only updates existing installs). `but skill check` shows whether it matches the CLI version. Do not vendor it into `.ai/skills/`.
- Use a separate worktree only when an agent needs its own runtime state, such as ports, build output, or a database. The Agent Desk keeps its plain-git worktrees.

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
- Every changed line traces to the request. A line that does not trace to it belongs in another change.
- Remove imports, variables, and helper code that your change made unused. Do not remove pre-existing dead code or fix unrelated defects unless asked; name them in the handoff so they are not lost.
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

Use STE-inspired prose without claiming full ASD-STE100 compliance. Preserve technical depth, domain terms, and meaningful uncertainty. This rule applies to human-facing prose, not internal agent scratch work.

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

In the final response for substantive work, state what you actually verified, not just an assertion of success. For implementation handoffs, put this evidence before the final **In plain language** section:

- Name the checks you ran and their result — e.g. "ran `pnpm check` — green", "`pnpm --filter @repo/auth test` — 93 passing", or the exact command and output you relied on.
- If a check was skipped or could not run, say so and why. Never claim done, fixed, or passing without evidence.
- This pairs with the focus banner: the banner grounds intent at the start, the verification close confirms the result at the end. Between them, a response that opens on-task but drifts mid-way is caught by the closing evidence.

## Domain Knowledge as Infrastructure

- Prefer encoding a class of mistake once (lint, test, REVIEW checklist, skill, CONTEXT) over re-fixing the same failure in every PR or agent session.
- After a domain or template review rejection that will recur, use `kaine-encode-knowledge` to promote the lesson into durable infrastructure.
- Also notice repeated successful workflows and corrections. Use `kaine-encode-knowledge` to assess available evidence and propose a reusable procedure. Check existing skills first, continue the requested task, and wait for authorization before creating or expanding a proposed skill. Do not repeat a declined suggestion without new evidence in context.
- Shared review contract lives in `REVIEW.md`, generated from `.ai/review.md` — edit the canonical source, then reinstall.
- Put product workflows in skills; use `kaine-*` for template-wide workflows. See `docs/agents/skill-authoring.md` for when and how to add skills.
- Prefer hard automation (lint, CI, tests) when a rule is proven; checklists and tests remain valid until automation is justified.
- See ADR 0009 for the full rationale and the knowledge-encoding loop.

## AI Skills

### Serena during coding work

- When Serena is available, read its `initial_instructions` once before code exploration and confirm the active project matches the workspace. If it is unavailable, state that limit and use ordinary tools. If the active project is another checkout, do not use Serena reads or edits; use ordinary tools. Claude worktree sessions start Serena from the main checkout's `.mcp.json`, so there it indexes and edits the main checkout.
- Use scoped symbol searches or file overviews, then retrieve only the bodies needed for the task. Do not repeat a full-file read or reload instructions already in context.
- Inspect references before changing shared code. In this monorepo, independently check callers across package boundaries: TypeScript reference results can omit other configured projects. An empty or short result does not prove that a symbol has no callers.
- Prefer symbol edits for whole definitions and reference-aware renames when caller coverage is verified. Use ordinary tools for prose, configuration, builds, tests, and small edits that symbolic replacement does not suit.
- Verify public exports after a rename. TypeScript can preserve the old barrel name with an alias; complete an intended API rename across that export and its consumers, then check that the old API name is absent.
- Read relevant Serena memories on demand, starting with `mem:core`, which says when to read each one. Installed memories are read-only. Keep stable shared facts in canonical `.ai/serena-memories/` sources and regenerate them.
- Local Claude and Codex sessions use Serena's REPL (`serena_repl`). Pass the session ID from `initial_instructions`, get API details with `s.info(...)`, and combine related lookups in one call. Use REPL code only through `s.lsp`, `s.edit`, read-only `s.fs`, and memory reads. REPL code runs outside the guarded-command hooks: do not run shell commands, subprocesses, or direct file or memory writes in it. Run commands with the agent's own shell so the hooks apply.
- After `rename_symbol` or a REPL symbol edit, read `git diff` for the changed files and run the package typecheck. A success message does not prove that every occurrence changed, and empty Serena diagnostics can mean a timeout, not a clean file. When references look stale after a tsconfig or package change, call `s.lsp.restart_language_server()` once, then re-check the result with grep.
- The parent agent performs Serena lookups requested by `kaine-explorer`; its read/search allowlist remains unchanged. Successful tool calls do not replace the repository's required tests and checks.
- Use `docs/agents/serena-verification.md` to verify tool choice, correctness, caller coverage, and retrieval overhead. Dashboard counts show activity, not task success.

### MCP tool routing

- Pick the tool by question: repo symbols and callers → Serena; blast radius across layers → Graphify (`kaine-graph`); third-party library APIs → the installed package, then Context7; better-auth config, plugins, and flows → Better Auth MCP first, then the installed package's types for the exact version, Context7 last; live UI behavior → Playwright; performance traces, network, and console → Chrome DevTools (opt-in); GitButler workspace stacks, branches, and review status → GitButler MCP (opt-in, read-only tools); GitHub → the `gh` CLI with `--json <fields>`; files → the agent's native tools. If a server is unavailable, state that limit and use ordinary tools.
- Graphify is required for impact work when its CLI is installed. Before a cross-package refactor, a plan, or a review that changes shared code, run `graphify affected "<symbol>"` or `graphify query "<question>"`. The `Knowledge graph:` startup line gives the graph state; agents without a SessionStart hook run `pnpm graph:status`. When the state is stale, run `pnpm graph:update` first; when it is absent, run `pnpm graph`. Treat results as leads and verify them with Serena or a direct read. For other work the graph is optional. When the CLI is missing, say so and use Serena and direct reading.
- Before writing code against a version-sensitive third-party API (better-auth, Drizzle, GraphQL Yoga, TanStack, Vite, Tauri, Expo), take the exact version from the `pnpm-workspace.yaml` catalog and read the installed package's types or source: that is the exact version. Use Context7 for packages that are not installed and for guides or examples. Context7 snapshots can lag the catalog, so check the version in its library ID, resolve each ID once per session, and query a narrow topic. Do not use either for repo code. Better Auth MCP documentation guides the approach; the installed better-auth types decide the API when the two differ.
- Use Playwright to check a UI change against `pnpm dev:web` (`http://localhost:3000`) as the seed user in `packages/db/src/seed/users.seed.ts`. Prefer accessibility snapshots to screenshots, and close the browser when done. Lasting proof belongs in an `apps/e2e/tests/*.e2e.ts` spec, not the transcript.
- `docs/agents/agent-engineering.md` records why GitHub, Sequential Thinking, and default filesystem MCP servers are not adopted, and why GitButler MCP is opt-in. Add a server only with that record.

Reusable AI workflows live in `.ai/skills/`. `.ai/` is the canonical source of truth for shared guide content, skills, MCP servers, Serena seed files, subagent definitions, lightweight Codex/Claude/Grok session hooks, and the command guard hooks for every supported agent. Run `pnpm ai:install` after editing `.ai/` sources so AGENTS, Claude import, Serena files, local per-agent installs, and AI setup hooks stay aligned. Supported install targets: `claude`, `codex`, `cursor`, `opencode`, `grok`. `pnpm quick-setup` and `pnpm initialize` also run `pnpm ai:install` during onboarding after dependency installation. Run `pnpm ai:doctor` to lint skills, check MCP requirements, and surface drift. Installed agent outputs should not be edited directly.

Codex, Claude, and Grok Build `SessionStart` hooks inject compact repo context at startup: repository name, branch, worktree status, and AI setup health. When `.ai/` inputs changed since the last refresh, they run `pnpm ai:install --auto`, which refreshes the installed skills, agents, and MCP config of every agent with a recorded selection. The Claude `UserPromptSubmit` hook runs the same check before each prompt, so a pull reaches a running session. `--auto` never writes tracked files: when it reports tracked drift, run `pnpm ai:install` and commit the result. Run `pnpm ai:doctor` when a hook warns. Grok project MCP lives in `.grok/config.toml` (requires folder trust in Grok Build).

Team-managed skills must use the `kaine-` prefix. To customize a team skill, copy it to a non-prefixed name in your local agent skill directory and edit the copy. The installer updates only `kaine-*` skills and project `<repoSlug>-*` skills, and leaves your personal copies alone; personal copies must not use either prefix.

### Skill selection for each request

- Before substantive final replies, read and apply `kaine-explain` for source-grounded explanations and useful format choices. This includes investigations, architecture answers, plans, reviews, and implementation handoffs. End with **In plain language** as the last section, inside any required plan wrapper and after review findings and verdict or implementation verification. Preserve the owning workflow's structure. Short factual answers, progress updates, and a single clarifying question need no extra section. Reuse unchanged instructions already loaded.
- When the harness indicates Plan mode, or the user asks you to write or revise an implementation plan, read and apply `kaine-write-plan`. Every completed plan must end with its “In plain language” section.
- Before the final handoff for completed, partial, or blocked implementation of code, configuration, or documentation, read and apply `kaine-summarize-work`. Apply it to PR delivery and revisions or shortened implementation summaries too. End with its **In plain language** section after technical results and verification. Standalone investigations, reviews, ordinary questions, and progress updates do not automatically trigger it; plans use `kaine-write-plan`.
- Before writing, changing, or planning tests, including tests inside an implementation, bug fix, or plan, read and apply `kaine-test` and pass its value gate for each new or changed test. Use `kaine-test-audit` for sweeps of existing tests.
- Before task-specific work, assess the available Kaine skill names and descriptions. Honor explicitly requested skills; otherwise select the smallest set that matches the actual workflow.
- Read selected skill instructions before applying them. Reuse instructions already loaded unless they changed. Load supporting references only as needed.
- If the skill index is missing or incomplete, inspect frontmatter metadata in canonical `.ai/skills/*.md`. Do not read every skill body or maintain a second index.
- Briefly name selected skills when starting substantive work. Simple replies and requests with no matching skill need no skill announcement.
- Reassess when the task changes, including transitions from implementation to review or PR preparation.
- Follow existing authorization boundaries. Selecting a skill does not expand the user's request.

Selection uses each agent's native discovery and model judgment. These instructions do not guarantee compliance on every request.

### Available skills

This index is generated from canonical skill metadata:

- `kaine-adopt-template`: Replace leftover upstream template identity with downstream project identity using the template adoption CLI.
- `kaine-audit-ui`: Audit a screen, a UI diff, or a recreated screenshot against the UI guidelines and WCAG 2.2, and report findings with rule IDs; in reference mode, also score how closely a recreation matches its image.
- `kaine-build-3d`: Add or change an interactive 3D view in the web or desktop UI with @repo/ui-3d — decide whether 3D is needed, then build an accessible, theme-colored, on-demand scene that a DOM control drives.
- `kaine-build-ui`: Build or change a screen or component in the web, desktop, desk, or mobile UI, or recreate a screenshot or brand look, using the theme utilities, the shared components, and the UI guidelines.
- `kaine-create-feature`: Scaffold an organization-scoped CRUD feature slice with the create-feature CLI, then finish the parts the generator deliberately leaves to a human.
- `kaine-create-theme`: Create, change, or set the default for a theme in @repo/theme, from a brand color, a brand book, a DESIGN.md, or a reference image, and pass the theme checks.
- `kaine-debug`: Find and fix the root cause of a local failure — a failing test, broken build, runtime error, or regression — by reproducing, localizing, and reducing it before changing code.
- `kaine-encode-knowledge`: Assess repeated workflows, corrections, or review failures; propose an existing skill improvement or a new reusable procedure, and encode authorized lessons in rules, tests, skills, or docs.
- `kaine-explain`: Give source-grounded explanations in a useful format, and close substantive final replies with In plain language while preserving plan, review, and handoff requirements.
- `kaine-fix-ci`: Investigate failing CI by reading logs, reproducing locally, and implementing the smallest safe fix.
- `kaine-graph`: Build and query the Graphify codebase knowledge graph for architecture, impact analysis, and cross-layer tracing.
- `kaine-harness-eval`: Measure whether a specific guide or agent-definition rule actually changes agent output, record the verdict in the harness-eval ledger, and choose a better wording for a rule marked tighten.
- `kaine-intake`: Assess a new issue for implementation readiness, specification work, missing information, or human handling without implementing it.
- `kaine-open-pr`: Create a task branch or prepare a draft pull request using Kaine Forge branch naming, checks, changeset rules, and GitHub flow.
- `kaine-rebase`: Safely rebase a feature branch onto main with conflict-resolution and verification rules.
- `kaine-release-apps`: Update per-app release branches after merge to main so only affected Docker-backed apps redeploy.
- `kaine-review`: Perform code-review style analysis focused on bugs, regressions, missing tests, security, performance, and template-rule violations.
- `kaine-scorecard`: Scan the monorepo, score it on ten health dimensions against evidence, render a visual dashboard, and file evidence-verified must-fix findings as GitHub issues.
- `kaine-secret-scan`: Run a full-history gitleaks secret scan and triage its findings before history becomes more visible.
- `kaine-setup-github`: Set up or check a repository's GitHub state (labels, Discussions, merge settings, security, rulesets, Projects board) from .github/repo-setup.json with pnpm github:setup — after creating a repo from the template, or when labels, rulesets, or the board drift.
- `kaine-shepherd-prs`: Keep a set of open PRs reviewable and mergeable (watch CI, fix failures, resolve conflicts, triage review bots), give the owner the merge order, and watch main after merges.
- `kaine-simplify`: Review a diff or audit the repo for over-engineering only — what to delete, replace with stdlib/platform features, or shrink. Use when asked "is this over-engineered", "what can we delete", "simplify review", "find bloat", or "audit for over-engineering".
- `kaine-summarize-work`: Write or revise implementation handoffs for completed, partial, or blocked code, configuration, and documentation changes, ending with a plain-language explanation of results and next steps.
- `kaine-sync-docs`: Reinstall and validate AI assistant files from canonical .ai sources.
- `kaine-test`: Required before writing, changing, or planning tests — pass the test value gate, then write or verify tests using Kaine Forge conventions.
- `kaine-test-audit`: Audit existing tests for low-value proof and remove it with evidence. Use for test-bloat sweeps of a file, feature, or workspace.
- `kaine-triage-deps`: Triage open Dependabot PRs against main and repo policy—prepare safe bumps for owner review, recreate conflicts, close unsafe one-offs with reasons, and track intentional upgrades.
- `kaine-triage-issue`: Verify each finding in a GitHub issue against current code; fix or triage only still-valid items, skip or close the rest with a brief reason, keep changes minimal, and validate.
- `kaine-write-issue`: Required before creating or rewriting a GitHub issue — write the body in the six-heading issue format the agent desk and kaine-intake read, then check it scores 6/6.
- `kaine-write-plan`: Write or revise implementation plans in Plan mode or when the user asks for a plan, always ending with a plain-language explanation for a nontechnical reader.

The `kaine-graph` skill layers an optional generated knowledge graph over the hand-written knowledge sources (Serena memories, `CONTEXT.md`, `docs/adr/`). Its `graphify-out/` output is local, regenerable, and never committed.

The `kaine-scorecard` skill tracks repo-level health over time in `docs/agents/monorepo-scorecard.md`, which is the tracked source of truth for band descriptors, scores, finding slugs, and calibration notes. `pnpm scorecard` regenerates that file's marker region and writes `scorecard-out/`, which is local, regenerable, and never committed. `REVIEW.md` governs diffs; the scorecard governs the repo.

Downstream products keep their own guide rules, review checks, skills, and agents in `.ai/project/` (`guide.md`, `review.md`, `skills/`, `agents/`). Project skill and agent names start with the `repoSlug` from `.ai/project/template.json`. `pnpm ai:sync` merges upstream changes into the other `.ai/` sources and never writes `.ai/project/` (ADR 0014).

Canonical AI sources are `.ai/guide.md`, `.ai/skills/*.md`, `.ai/agents/*.md`, `.ai/hooks/*`, `.ai/permissions.json`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/review.md`, `.ai/serena-project.yml`, and `.ai/serena-memories/*.md`. Personal MCP values and overrides live in `.ai.local/`, which is gitignored.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `ognjenmarcheta/kaine-forge` using the `gh` CLI. See `docs/agents/issue-tracker.md`. Write or rewrite every issue body with `kaine-write-issue`, in the six-heading format of `docs/agents/issue-format.md` that the agent desk reads.

### Triage labels

Triage uses the canonical skill triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout: root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Guarded Commands

The hook `.ai/hooks/pre-tool-use.mjs` applies `.ai/permissions.json` to supported
literal command forms. `deny` blocks matched calls on agents that honour the hook.
`ask` is a real verdict on Claude, Cursor, and OpenCode (OpenCode: rules without a
flag) and degrades to an advisory elsewhere.
Hooks are guardrails, not a complete security boundary. Supported syntax and
failure behavior are documented in `docs/agents/agent-engineering.md`.

- **deny** `pnpm db:push` — Unrestricted schema push can drop columns in DATABASE_URL. Shared and deployed databases require pnpm db:generate and reviewed migrations. The local wrapper requires explicit opt-in and validates loopback PostgreSQL. Use `pnpm db:push:local` instead.
- **deny** `pnpm clean-deps` — Removes every node_modules directory in the tree. Use `pnpm clean` instead.
- **deny** `pnpm release:apps` — Moves release/<app> branches, which triggers deploys. The Release workflow owns this on main after merge.
- **deny** `git ... --no-verify` — Bypasses commitlint, the AI-attribution gate, and the pre-push typecheck. Fix the hook failure instead of skipping it.
- **ask** `pnpm db:seed` — Rewrites the seed user's credential row in whatever DATABASE_URL points at.
- **ask** `pnpm db:migrate` — Applies migrations to whatever DATABASE_URL points at.
- **ask** `pnpm reinstall-deps` — Wraps clean-deps and reinstalls the whole workspace.
- **ask** `pnpm github:setup ... --apply` — Changes the GitHub repository's settings, rulesets, labels, and Projects board. The dry run and --check change nothing.
- **ask** `git push ... --force` — Destructive on a shared branch. kaine-rebase needs it, so it asks rather than denies. --force-with-lease is unaffected.
- **ask** `git push ... -f` — Short form of --force.
- **ask** `git reset --hard` — Discards uncommitted work irrecoverably.
- **deny** `gh pr merge` — Only the repository owner merges manually. Agents may create PRs but must not merge them or enable automatic merging.
- **deny** `gh pr review ... --approve` — The repository owner reviews and approves contributions. Agents must not approve on the owner's behalf.
- **deny** `but land` — Lands a GitButler branch on the target without a pull request. Only the repository owner merges into main. Use `but pr new <branch> --draft` instead.
- **deny** `but pr auto-merge` — Only the repository owner merges manually. Agents must not enable automatic merging.
- **deny** `but ... --no-verify` — Bypasses the pre-push hook, which is the only local commitlint and AI-attribution gate for GitButler commits. Fix the hook failure instead of skipping it.
- **deny** `but ... --no-hooks` — Same bypass as --no-verify under its GitButler name.
- **ask** `but push ... --with-force` — Force-pushes a GitButler branch that is not fast-forward. Destructive on a shared branch.
- **ask** `but push ... -f` — Short form of --with-force.
- **ask** `but ... --skip-force-push-protection` — Turns off GitButler's lease check, so a force push can overwrite commits someone else pushed.
- **ask** `but push ... -s` — Short form of --skip-force-push-protection.
- **ask** `but pr new ... -s` — Short form of --skip-force-push-protection.
