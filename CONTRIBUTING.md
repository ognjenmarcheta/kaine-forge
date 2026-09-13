# Contributing

Thanks for improving Kaine Forge. This repository is a template, so changes should preserve reusable defaults and avoid product-specific assumptions.

## Working Rules

- Start from `main` and work on a focused branch.
- Work from the repository root.
- Read `MONOREPO_GUIDE.md` before code changes.
- Read `DESIGN_SYSTEM.md` before UI, styling, token, or component changes.
- Use `pnpm --filter <workspace> <script>` for scoped commands.
- Keep changes surgical and reviewable.

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

Publication settings and verification evidence are tracked in
[public repository readiness](docs/publication-readiness.md).

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

Repository settings the template cannot carry over (GitHub copies files, not settings):

- Enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, or the Release workflow cannot open version pull requests.
- Import both branch rulesets from `.github/rulesets/main.json` and `.github/rulesets/main-owner.json`, after confirming the owner is the only repository administrator.
- Optional: set the remote Turbo cache secret `TURBO_TOKEN` and variable `TURBO_TEAM` (see [CI speed](#ci-speed-maintainers)).

## AI Assistant Files

`.ai/` is canonical for shared assistant guidance. Do not edit installed assistant outputs directly.

After changing `.ai/guide.md`, `.ai/review.md`, `.ai/skills/*.md`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/serena-project.yml`, or `.ai/serena-memories/*.md`, run:

```bash
pnpm ai:install
pnpm ai:doctor
```

Shared tracked outputs include `AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `.serena/project.yml`, and `.serena/memories/*`. Canonical review guidance lives in `.ai/review.md` and is installed to tracked `REVIEW.md`. Local gitignored outputs include `.claude/skills/*`, `.agents/skills/*`, `.cursor/skills/*`, `.cursor/rules/*`, `.grok/skills/*`, `.grok/hooks/*`, `.grok/agents/*`, `.mcp.json`, `.codex/config.toml`, `.cursor/mcp.json`, `.grok/config.toml`, and `opencode.json`.

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
- Keep Jira, CodeRabbit, company-specific MCP servers, and other org-specific automation out of the template by default.

Create release metadata:

```bash
pnpm changeset
```

CI checks for pull requests are defined in `.github/workflows/ci-pr.yml`. Nothing makes them required until the ruleset in `.github/rulesets/main.json` (required checks, squash-only pull requests, no bypass actors or merge queue) is imported. The owner remains the only account with merge authority. Import it once per repository (public repositories, or GitHub Pro and up); update the existing ruleset by ID instead of creating a duplicate:

```bash
gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main.json
gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main-owner.json
```

The owner-only ruleset permits only the repository administrator to update the
default branch through a PR. Keep the owner as the only administrator. Its
PR-only exception grants permission to merge, not permission to ignore checks:
the separate quality ruleset has no bypass actors. Apps can retain access to
feature branches without receiving permission to merge into `main`. GitHub cannot
distinguish the owner from automation using the owner's personal credentials.

Contract tests keep the required check names and the two rulesets aligned.

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

### Remote Turbo cache (recommended for forks and high PR volume)

1. Create a [Vercel Remote Cache](https://turborepo.dev/docs/core-concepts/remote-caching) token (or compatible provider).
2. Set repository **secret** `TURBO_TOKEN` and **variable** `TURBO_TEAM`.
3. CI jobs already export these env vars; when unset, builds still use local `.turbo/cache` between jobs.

### Affected and path filters

- PR `check-fast` runs Turbo with `--filter=...[origin/<base>]` so only changed packages (and dependents) run format/lint/typecheck/test.
- Path filters skip GraphQL drift, core build, Docker image builds, and e2e on pure docs/AI PRs.
- Mobile typecheck is required when `apps/mobile/**` or `packages/mobile-ui/**` change.
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
