---
name: kaine-open-pr
description: Create a task branch or prepare a draft pull request using Kaine Forge branch naming, checks, changeset rules, and GitHub flow.
argument-hint: task, linked issue, branch name, or PR summary
---

# Branch and PR Workflow

Use this skill when creating a work branch or preparing local work for a pull request.
Complete the requested stage; a branch-only request does not require a commit or PR.

## Branch setup

1. Inspect `git status --short` and `git branch --show-current`. Preserve uncommitted work and any checkout used by another task.
2. Continue an existing task branch when appropriate; do not rename it to adopt this standard. Otherwise reuse a suitable free checkout or create an isolated worktree through the host's worktree tools when available.
3. For a new branch, follow `CONTRIBUTING.md` Branch names: `KAINE-<issue-number>-<type>-<description>`, or `KAINE-<type>-<description>` when no issue exists. Use the task's real GitHub issue number; do not create an issue just for naming. Keep `KAINE` uppercase, the Conventional Commit type and description lowercase, and words separated by hyphens. No agent names, personal prefixes, spaces, or slashes. Automation-owned branch names stay unchanged.
4. Run `git fetch origin`, validate the chosen name with `git check-ref-format --branch <branch>`, then create it with `git switch -c <branch> origin/main`. If the name already exists, inspect it before reuse; do not overwrite it. Make edits on the task branch, not `main`.

Examples: `KAINE-287-fix-metro-image-size`, `KAINE-427-chore-clack-prompts`, `KAINE-docs-pr-ci-badge`.

## Preflight

1. Confirm the working tree scope with `git status --short`.
2. Confirm the branch is not `main`.
3. Review changed files for unrelated edits.
4. When `.ai/` sources are edited, run `pnpm ai:install` and then `pnpm ai:doctor`.
5. Do not commit local installed assistant outputs from `.claude/`, `.agents/`, `.cursor/`, `.grok/`, `.mcp.json`, or `opencode.json`.
6. If source packages or apps changed, decide whether a `.changeset/*.md` file is required or whether the PR should carry `release:skip-changeset`. `pnpm changeset` is interactive. To write the file without it, create `.changeset/<short-kebab-name>.md` with frontmatter that lists each affected package and its bump (`"@repo/name": patch|minor|major`), a closing `---` line, then a one- or two-sentence summary. A headless run (the Agent Desk engine) uses this form.
7. If the change affects a deployable app defined by `Dockerfile.<app>`, note that the Release workflow updates the relevant `release/<app>` branches after merge. Manual `pnpm release:apps` commands, including dry-runs, are human operations.

## Validation

Prefer targeted checks first, then broader checks when the blast radius is wider:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm run build:core`

Use the validation tiers in `docs/agents/day-one.md`. Do not push or mark a PR ready while required gates fail.

## Commit and push

1. Review the diff, stage only task files, and commit with a Conventional Commit message under the human contributor's identity. Keep hooks enabled; do not add AI attribution.
2. Push the branch with upstream tracking: `git push -u origin <branch>`. Use normal follow-up pushes for later commits; do not force-push as part of opening a PR.

## PR Description

Use `.github/pull_request_template.md` as the shape. Include:

- Summary of behavior changed.
- Tests and checks run.
- Screenshots or recordings for visible UI changes.
- Notes about migrations, environment variables, or generated files.

Open against `main` as draft unless the user explicitly asks for ready-for-review. Include the linked issue when one exists. Use `gh pr create --base main --head <branch> --draft --title <title> --body-file <file>` with the prepared description; omit `--draft` only for an explicit ready-for-review request. Report the PR URL and the checks actually run.

Stop at the PR handoff. Only the repository owner performs the final merge manually after required checks pass. Do not merge, approve on the owner's behalf, enable automatic merging, or bypass protection through CLI, API, or browser actions.
