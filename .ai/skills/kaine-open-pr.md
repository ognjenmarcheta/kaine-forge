---
name: kaine-open-pr
description: Prepare a draft pull request using Kaine Forge checks, changeset rules, and GitHub flow.
argument-hint: branch name or PR summary
---

# Open PR Workflow

Use this skill when preparing local work for a pull request.

## Preflight

1. Confirm the working tree scope with `git status --short`.
2. Confirm the branch is not `main`.
3. Review changed files for unrelated edits.
4. When `.ai/` sources are edited, run `pnpm ai:install` and then `pnpm ai:doctor`.
5. Do not commit local installed assistant outputs from `.claude/`, `.agents/`, `.cursor/`, `.grok/`, `.mcp.json`, or `opencode.json`.
6. If source packages or apps changed, decide whether a `.changeset/*.md` file is required or whether the PR should carry `release:skip-changeset`.
7. If the change affects a deployable app defined by `Dockerfile.<app>`, note that `pnpm release:apps` must run from synced `main` after merge so only the relevant `release/<app>` branches redeploy.

## Validation

Prefer targeted checks first, then broader checks when the blast radius is wider:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm run build:core`

## PR Description

Use `.github/pull_request_template.md` as the shape. Include:

- Summary of behavior changed.
- Tests and checks run.
- Screenshots or recordings for visible UI changes.
- Notes about migrations, environment variables, or generated files.

Open as draft unless the user explicitly asks for ready-for-review.
