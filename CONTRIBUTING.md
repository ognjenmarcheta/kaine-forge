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

For a full bootstrap:

```bash
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

`.ai/` is canonical for shared assistant guidance. Do not edit generated assistant outputs directly.

After changing `.ai/guide.md`, `.ai/skills/*.md`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/serena-project.yml`, or `.ai/serena-memories/*.md`, run:

```bash
pnpm ai:sync
pnpm ai:sync:check
```

Generated outputs include `AGENTS.md`, `CLAUDE.md`, `.claude/skills/*`, `.codex/skills/*`, `.cursor/rules/*`, `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.serena/project.yml`, and `.serena/memories/*`.

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
pnpm ai:sync:check
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

## Coding Standards

- Strict TypeScript. Do not use `any`.
- Use generated GraphQL hooks and do not hand-edit generated GraphQL files.
- Keep user-facing strings in translation files.
- Use `@repo/ui` for web/desktop UI and `@repo/mobile-ui` for mobile UI.
- Use design tokens for visual values.
- Preserve FDD naming and `@repo/*` package boundaries.
