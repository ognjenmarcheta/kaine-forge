# Contributing

Thanks for improving Kaine Forge. This repository is a template, so changes should preserve reusable defaults and avoid product-specific assumptions.

## Working Rules

- Start from `main` and work on a focused branch.
- Work from the repository root.
- Read `MONOREPO_GUIDE.md` before code changes.
- Read `DESIGN_SYSTEM.md` before UI, styling, token, or component changes.
- Use `pnpm --filter <workspace> <script>` for scoped commands.
- Keep changes surgical and reviewable.

## Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:ensure
pnpm db:push
pnpm db:seed
pnpm dev
```

If setup fails (port conflicts, `INVALID_ORIGIN` on sign-in, codegen format noise, Docker not running), see [`docs/troubleshooting.md`](docs/troubleshooting.md).

For a full bootstrap (requires running Docker services):

```bash
docker compose up -d
pnpm initialize
```

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

Required CI checks are defined in `.github/workflows/ci-pr.yml`.

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

Optional remote Turborepo cache: set repository secret `TURBO_TOKEN` and variable `TURBO_TEAM` (Vercel Remote Cache or compatible). When unset, CI still uses local `.turbo/cache` actions.

Path filters skip GraphQL drift, core build, Docker image builds, and e2e on pure docs/AI PRs that do not touch `apps/**`, `packages/**`, or related tooling.
