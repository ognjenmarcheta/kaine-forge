# Contributing

Thanks for improving Kaine Forge. This repository is a template, so changes should preserve reusable defaults and avoid product-specific assumptions.

## Working Rules

- Start from `main` and work on a focused branch.
- Work from the repository root.
- Read `MONOREPO_GUIDE.md` before code changes.
- Read `DESIGN_SYSTEM.md` before UI, styling, token, or component changes.
- Use `pnpm --filter <workspace> <script>` for scoped commands.
- Keep changes surgical and reviewable.

## Branch names

New work branches created by people or agents use `KAINE-<issue-number>-<type>-<description>`.
When the task has no GitHub issue, use `KAINE-<type>-<description>`.

- Keep the literal `KAINE` prefix uppercase.
- Use the real issue number when the task has one. Do not create an issue just to name a branch.
- Use a Conventional Commit type: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `revert`.
- Keep the type and description lowercase. Use a short description with hyphens between words.
- Do not use agent names, personal prefixes, spaces, or slashes.

Examples: `KAINE-287-fix-metro-image-size`, `KAINE-427-chore-clack-prompts`, and `KAINE-docs-pr-ci-badge`.

For a new task, fetch `origin` and create the branch from current `origin/main` in a suitable checkout.
Continue an existing task branch when appropriate, preserving uncommitted work.
Existing branches keep their names. Automation-owned branches such as `dependabot/*`,
`changeset-release/*`, and `release/<app>` keep their established names.
This standard is enforced through contributor and agent guidance; there is no branch-name CI gate.

## Recommended: GitButler

[GitButler](https://docs.gitbutler.com/) is the recommended local client. It applies several branches in one checkout, so you and several agent sessions can work on separate branches at the same time without one worktree each.

1. Install the desktop app or the CLI: `curl -fsSL https://gitbutler.com/install.sh | sh`.
2. In the repository root, run `but setup`. It switches the checkout to `gitbutler/workspace` and sets `origin/main` as the target.
3. In the desktop app, open the project settings. Under Git hooks, turn on "Run Git hooks" and "Enable Husky hooks". Under Git, turn on "Force push protection". All three are per project, and the Husky and force-push settings are off by default. Without "Enable Husky hooks", `but push` and `but pr new` skip the `.husky` hooks, including the pre-push commitlint gate.
4. Install GitButler's agent skill for your agents: `but skill install --global`, or `but skill install --path <dir>` for each agent's skill folder. After a CLI update, run `but skill install --detect` to update the existing installs, then `but skill check`. `--detect` only updates; on a first install it fails.
5. Optional: add the read-only GitButler MCP server for your agents: `pnpm ai:install --mcp gitbutler`.

The branch-name rule above still applies. Pass the name to the first commit: `but commit -b KAINE-<n>-<type>-<description> -m "<message>"`. Open pull requests with `but pr new <branch> --draft`. `but commit` does not run the `commit-msg` hook, so the `pre-push` hook runs commitlint on every pushed commit when "Enable Husky hooks" is on. Agent rules are in `AGENTS.md` (Version Control with GitButler).

To return to plain git, run `but teardown`. It checks out a normal branch and keeps GitButler's metadata, so `but setup` brings you back.

## Pull requests and owner approval

Outside contributors submit pull requests from forks. Only the repository owner
merges into `main`, manually after required checks pass. This includes release
version PRs. Agents and bots may prepare changes and open PRs; they must not merge,
approve on the owner's behalf, enable automatic merging, or bypass protection.

The owner's manual merge is the final approval. An additional approving reviewer
is not required while there is one maintainer, and GitHub does not allow authors
to approve their own PRs. Resolve review conversations and update the branch before
merging. The required checks are **PR Quality Gate** and **Analyze TypeScript**.
The aggregate gate accepts only successful jobs or skips justified by the change's
paths and workflow event. These requirements also apply to the owner.

Fork workflows require the owner's approval before execution. Do not give fork
workflows repository secrets or write tokens. The repository defaults to read-only
workflow tokens; release and labeling jobs declare their limited write permissions.

Version PRs opened using `GITHUB_TOKEN` do not trigger PR workflows automatically.
The owner can close and reopen the version PR in GitHub to trigger checks. Do not
merge until the required checks pass. A separately configured `RELEASE_PR_TOKEN`
also supports triggering CI; no such credential is required for local setup.

The 2026-09-13 publication audit, its target settings, and the transition evidence are
archived in [public repository readiness](docs/archive/publication-readiness.md).

## Setup

```bash
pnpm install --frozen-lockfile
pnpm env:ensure
# Set ALLOW_LOCAL_DB_PUSH=true in .env for your local PostgreSQL database.
pnpm quick-setup
```

If setup fails (port conflicts, `INVALID_ORIGIN` on sign-in, codegen format noise, Docker not running), see [`docs/troubleshooting.md`](docs/troubleshooting.md).

For bootstrap without development servers, after the same local opt-in:

```bash
docker compose up -d --wait
pnpm bootstrap   # env, install, AI files, build, db — no dev servers
pnpm dev         # or: pnpm initialize  (= bootstrap + dev)
```

New shared package scaffold:

```bash
pnpm create:package my-lib
```

## Editor setup

Formatting and linting are enforced by Prettier and ESLint (flat config) and shared through `.editorconfig`. Editor config is committed so contributors get the same behavior.

- **VS Code / Cursor:** open the repo and accept the recommended extensions from `.vscode/extensions.json` (Prettier, ESLint, Tailwind, EditorConfig, Playwright, GraphQL, Vitest, Expo, Tauri). `.vscode/settings.json` enables format-on-save with Prettier plus ESLint autofix and pins the workspace TypeScript version. Cursor reads the same `.vscode/` files.
- **WebStorm / JetBrains:** `.editorconfig` is honored natively. Enable **Prettier → "Run on save for files"** and **ESLint → "Automatic ESLint configuration"**, and set the Node interpreter from `.nvmrc`. JetBrains stores IDE settings in the gitignored `.idea/`, so these are set per machine rather than committed.

Commit messages are checked by `commitlint` (Conventional Commits) via a `commit-msg` hook; the allowed types match the `type:*` PR labels. AI self-attribution is rejected: no assistant `Co-Authored-By` trailers and no “Generated with …” / “Made with …” AI footers — commits stay under the human contributor’s identity only.

## Common Commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build:core
pnpm test:e2e
```

Scoped examples:

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/web typecheck
pnpm --filter @repo/mobile typecheck
pnpm --filter @repo/mobile-ui typecheck
```

Turbo docs quick lookup:

```bash
pnpm exec turbo docs "<query>"
```

## Template Adoption

After creating a repository from this GitHub template, run adoption once **before** `pnpm initialize` or normal bootstrap. Adoption replaces active Kaine Forge identity with your product identity while preserving internal `@repo/*` package names and imports.

```bash
pnpm install
pnpm template:adopt
# review dry-run, then:
pnpm template:adopt --write
pnpm ai:install
pnpm ai:doctor
pnpm template:adopt --check
```

Non-interactive: create `template-adoption.json` with at least `productName`, `desktopIdentifier`, `compatibilityPolicy`, and `designCompatibilityPolicy`. Add `repoOwner` (recommended) to rewrite the GitHub owner in badge URLs, links, and `CODEOWNERS`. Then:

```bash
pnpm template:adopt --config template-adoption.json --write
pnpm ai:install && pnpm ai:doctor && pnpm template:adopt --check
```

After adoption: rotate secrets, rewrite `.env.example` defaults, review remaining `--check` findings, and keep org-specific MCP/skills only in the downstream project.

Repository settings the template cannot carry over (GitHub copies files, not settings) are in `.github/repo-setup.json`: labels, Discussions, squash-only merging, Actions permissions, security features, both branch rulesets, and the Projects board. Confirm that the owner is the only repository administrator, then apply them with the `gh` CLI:

```bash
pnpm github:setup            # dry run: shows each change
pnpm github:setup --apply    # applies it; needs admin rights
pnpm github:setup --check    # exits 1 while anything differs
```

- The Release workflow needs **Allow GitHub Actions to create and approve pull requests** to open version pull requests. The command turns it on.
- The board needs `gh auth refresh -s project` once. The command prints the steps GitHub has no API for: board workflows and missing discussion categories.
- CI caches Turbo task results with no setup (see [CI speed](#ci-speed-maintainers)).

### Stay up to date with the template AI setup

`template:adopt --write` records your identity and the upstream in `.ai/project/template.json`. Commit that file. Put your own AI rules in `.ai/project/`: `guide.md` (appended to `AGENTS.md`), `review.md` (appended to `REVIEW.md`), `skills/`, and `agents/`. Project skill and agent names start with your `repoSlug`. Sync never writes this folder.

Pull upstream changes on a clean tree, then review and commit the diff:

```bash
pnpm ai:sync --check
pnpm ai:sync
```

Sync merges the files in `.ai/template-sync.manifest.json` and keeps your names and edits. It marks overlapping edits with git conflict markers. Resolve them, then run `pnpm ai:install` and `pnpm ai:doctor`. `--ref <tag|sha>` picks another upstream point, and `--dry-run` writes nothing.

<!-- TEMPLATE_ONLY_START -->

If your project was adopted before `ai:sync` existed, copy the sync tool from upstream, commit it, and initialize it with your adoption config:

```bash
git fetch https://github.com/ognjenmarcheta/kaine-forge.git main
for f in .ai/template-sync.ts .ai/template-sync.util.ts .ai/template-adoption.util.ts; do git show FETCH_HEAD:$f > $f; done
git add .ai/template-sync.ts .ai/template-sync.util.ts .ai/template-adoption.util.ts
git commit -m "chore(ai): add template sync tool"
pnpm exec tsx .ai/template-sync.ts --init template-adoption.json
```

Add `"ai:sync": "tsx .ai/template-sync.ts"` to your root `package.json` scripts. If sync picks the wrong starting point, pass `--base <upstream-sha>`.

<!-- TEMPLATE_ONLY_END -->

## AI Assistant Files

`.ai/` is canonical for shared assistant guidance. Do not edit installed assistant outputs directly.

After changing `.ai/guide.md`, `.ai/review.md`, `.ai/skills/*.md`, `.ai/agents/*.md`, `.ai/hooks/*`, `.ai/permissions.json`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/serena-project.yml`, or `.ai/serena-memories/*.md`, run:

```bash
pnpm ai:install
pnpm ai:doctor
```

Shared tracked outputs include `AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `.claude/settings.json`, and `.serena/memories/*`. Canonical review guidance lives in `.ai/review.md` and is installed to tracked `REVIEW.md`. Local gitignored outputs include `.claude/skills/*`, `.claude/agents/*`, `.claude/hooks/*`, `.agents/skills/*`, `.cursor/skills/*`, `.cursor/rules/*`, `.cursor/hooks.json`, `.grok/skills/*`, `.grok/hooks/*`, `.grok/agents/*`, `.opencode/skills/*`, `.opencode/plugins/*`, `.opencode/agents/*`, `.serena/project.yml`, `.mcp.json`, `.codex/config.toml`, `.cursor/mcp.json`, `.grok/config.toml`, and `opencode.json`.

`pnpm ai:install` keeps each agent's recorded skill selection in `.ai.local/installations/<agent>.json`. A reinstall also adds default skills that the team added since that record, and keeps any skill you removed. `pnpm ai:doctor` reports a new team skill as missing until you reinstall.

Claude Code does not start the project MCP servers in `.mcp.json` until you approve them. `claude mcp list` shows an unapproved server as "Pending approval". Approve them once per checkout: run `/mcp` in a Claude Code session, or name them in the untracked `.claude/settings.local.json`:

```json
{ "enabledMcpjsonServers": ["context7", "better-auth", "playwright", "serena", "gitbutler"] }
```

Name each server instead of setting `enableAllProjectMcpServers`, so a server added to `.mcp.json` later still needs your approval. A running session loads MCP servers only at start; open a new session after you approve.

`better-auth` is a remote server (`https://mcp.better-auth.com/mcp`). It has only read-only documentation tools and needs no credentials. For auth work, also install the Better Auth agent skills for your agents: `npx skills add better-auth/skills`. The template does not vendor them, because team skills in `.ai/skills/` must use the `kaine-` prefix.

When `.ai/` sources change, the canonical skill list in `AGENTS.md` should pick up the new or renamed skills after `pnpm ai:install`.

## Day-one agent ramp

If you (or an agent) are new to this repo:

1. `pnpm ai:install` then `pnpm ai:doctor`
2. Read `CONTEXT.md` → `REVIEW.md` → `MONOREPO_GUIDE.md` (and `DESIGN_SYSTEM.md` for UI)
3. Prefer skills (`kaine-test`, `kaine-review`, `kaine-open-pr`, `kaine-encode-knowledge`) over freeform prompts for known workflows
4. Full walkthrough: `docs/agents/day-one.md`

When review rejects a change for domain or template reasons, use `kaine-encode-knowledge` so the rule is encoded for the next contributor.

## Pull Requests

- Use a conventional-style title when possible: `feat(scope): ...`, `fix(scope): ...`, `docs(scope): ...`, or `chore(scope): ...`.
- Describe the behavior change, risk, and validation.
- Include tests for new behavior.
- Include a changeset for source changes in `apps/**`, `packages/**`, or `tooling/**`, unless the PR is intentionally non-releasable and labeled `release:skip-changeset`.
- A breaking GraphQL schema change fails **GraphQL Schema Compatibility** until the owner adds the label `graphql:breaking-approved` and re-runs the job.
- Keep Jira, CodeRabbit, company-specific MCP servers, and other org-specific automation out of the template by default.

Create release metadata:

```bash
pnpm changeset
```

CI checks for pull requests are defined in `.github/workflows/ci-pr.yml`. Nothing makes them required until the ruleset in `.github/rulesets/main.json` (required checks, squash-only pull requests, no bypass actors or merge queue) is imported. The owner remains the only account with merge authority. Import it once per repository (public repositories, or GitHub Pro and up). `pnpm github:setup --apply --only rulesets` imports both rulesets and updates an existing ruleset by name instead of creating a duplicate.

The owner-only ruleset exempts only the repository administrator from its update
restriction. Keep the owner as the only administrator. This exception applies
only to that restriction: the separate quality ruleset has no bypass actors and
still requires a PR and passing checks. Use an `exempt` exception on the update
rule so the owner can use the normal merge button without a bypass checkbox.
Apps can retain access to
feature branches without receiving permission to merge into `main`. GitHub cannot
distinguish the owner from automation using the owner's personal credentials.

Contract tests keep the required check names and the two rulesets aligned.

Private repositories can opt into owner-managed Linux and macOS runners to
reduce hosted Actions minutes. See [Optional self-hosted CI](docs/self-hosted-ci.md)
for the repository variables, machine requirements, validation, and rollback.
Hosted runners remain the default. Required checks and owner-only merging remain
in force.

## Validation Expectations

Before opening a PR, run the narrowest relevant checks plus the root gates for broad changes.

For documentation or AI scaffold changes:

```bash
pnpm ai:doctor
pnpm format:check
```

For code changes:

```bash
pnpm check
pnpm build:core
```

For user-facing web/API flows:

```bash
pnpm test:e2e
```

## Release Flow

```bash
pnpm release:status
pnpm release:version
pnpm release:publish
```

`main` merges run the release workflow. Changesets creates or updates a version PR, and version PR merges create tags and GitHub Releases. This template does not publish npm packages by default.

Deployable apps are defined by top-level `Dockerfile.<app>` files. After a merged change affects one or more deployable apps, run:

```bash
pnpm release:apps --dry-run
pnpm release:apps
```

On `main`, the Release workflow runs `pnpm release:apps` after quality gates so most merges need no manual step. Manual CLI is for dry-runs, repairs, or skipped automation. The command updates only the affected `release/<app>` branches, which lets deployment systems such as Dokploy watch per-app branches instead of redeploying every app on each merge. Use `pnpm release:apps --apps all` to initialize missing release branches intentionally.

## Coding Standards

- Strict TypeScript. Do not use `any`.
- Use generated GraphQL hooks and do not hand-edit generated GraphQL files.
- Keep user-facing strings in translation files.
- Use `@repo/ui` for web/desktop UI and `@repo/mobile-ui` for mobile UI.
- Use design tokens for visual values.
- Preserve FDD naming and `@repo/*` package boundaries.

## CI speed (maintainers)

### Turbo cache in CI

- CI needs no setup. The `rharkor/caching-for-turbo` step runs a Turbo remote-cache server in each job and stores each task result as its own GitHub Actions cache entry. Any job can reuse a task that another job or `main` already ran.
- A PR branch can read caches saved on `main`, so the Release job seeds the cache for every PR.
- For a local remote cache, set `TURBO_TOKEN` and `TURBO_TEAM` in your shell ([Vercel Remote Cache](https://turborepo.dev/docs/core-concepts/remote-caching) or a compatible server). CI does not read them.

### Affected and path filters

- PR `check-fast` runs Turbo with `--filter=...[origin/<base>]` so only changed packages (and dependents) run format/lint/typecheck. Workspace tests run once, over the full repo, in the `coverage` job.
- `ai-checks` runs the root `.ai/` checks and the `scripts/*.test.mjs` tests on every PR, beside `check-fast`. `build-core` and e2e also start beside `check-fast`; the PR Quality Gate still needs every job.
- `detect-paths` runs `turbo ls --affected` and `scripts/ci-affected.mjs` to choose the heavy jobs from the package graph: coverage when an app or package is affected, core build and e2e when `@repo/api`, `@repo/web`, or `@repo/e2e` is affected, one Docker image per affected app, and the mobile jobs when `@repo/mobile` or `@repo/mobile-ui` is affected. A tooling-only or docs-only PR skips them all.
- The graph is safe to trust because `turbo boundaries` (Check Fast) fails on an import that is not a declared dependency, Metro's `@repo/*` resolution in `apps/mobile` included.
- Files outside the package graph (the `force` filter: CI workflow and setup action, `Dockerfile.*`, `.npmrc`, `.nvmrc`, root `vitest*.ts`, `scripts/**`, `MONOREPO_GUIDE.md`, `DESIGN_SYSTEM.md`) run every job. Merge queue and manual runs always run every job. The PR Quality Gate re-derives the allowed skips from the `detect-paths` outputs.
- Shared setup lives in `.github/actions/setup-node-pnpm`.

### Dependency catalogs

Shared versions are defined in `pnpm-workspace.yaml` (`catalog:` and `catalogs.mobile`). Prefer catalog references in package.json; do not reintroduce duplicate version ranges for cataloged packages.

### Security scans (with and without GitHub Code Scanning)

Default security coverage does **not** require GitHub Advanced Security (GHAS):

- **CodeQL** always analyzes TypeScript in CI; results upload to the Security tab only on public repos, or on private repos after you enable Code scanning and set the Actions variable `ENABLE_GITHUB_CODE_SCANNING=true`.
- **Dependency Review** runs only under the same public / opt-in gate (needs the Dependency Graph product).
- Without Code Scanning (private repo, no GHAS): **Gitleaks** (secrets), **Trivy** (container CRITICAL fail), and **`pnpm audit`** (scheduled + main) stay hard gates without GHAS.

Private repos with GHAS: enable Code scanning under repository security settings, then set **Settings → Secrets and variables → Actions → Variables → `ENABLE_GITHUB_CODE_SCANNING=true`**.

## Local database and release commands

Use `pnpm db:prepare:local` for local setup and `pnpm db:push:local` for local schema changes, with explicit `ALLOW_LOCAL_DB_PUSH=true` opt-in. Shared databases use reviewed migrations. See [local database rules](MONOREPO_GUIDE.md#22-local-database-and-release-commands).

The Release workflow updates deployment branches. Manual `pnpm release:apps` commands, including dry-runs, are human-only.
