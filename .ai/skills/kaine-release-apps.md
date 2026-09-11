---
name: kaine-release-apps
description: Update per-app release branches after merge to main so only affected Docker-backed apps redeploy.
argument-hint: optional app list, dry-run request, or base ref
---

# Release Deployable Apps

Use this skill when deployable app release branches need attention after a change lands on `main`.

## Automated path

The GitHub **Release** workflow (`.github/workflows/release.yml`) runs `pnpm release:apps` on every successful `main` push after quality gates and before the changesets version step. Prefer relying on that automation. Manual CLI is for dry-runs, repairs, or when automation was skipped.

## Manual workflow (human operator only)

Agent policy denies `pnpm release:apps`, including `--dry-run`. An agent can inspect the workflow and prepare a repair proposal. The human operator runs the commands below; task completion does not require an agent to execute them.

1. Confirm the repo is on `main`, the working tree is clean, and local `main` is synchronized with `origin/main`.
2. Identify whether the change affects a deployable app. Deployable apps are defined by top-level `Dockerfile.<app>` files and shared package changes fan out through the workspace graph.
3. Run `pnpm release:apps --dry-run` first to see which `release/<app>` branches will move.
4. Run `pnpm release:apps` to create or fast-forward only the affected `release/<app>` branches.
5. When intentionally initializing or republishing every deployable app branch, run `pnpm release:apps --apps all`.
6. Report which release branches moved and call out any branches that were intentionally untouched.

## Rules

- Do not run this workflow from feature branches.
- Do not push `release/<app>` branches manually unless you are repairing a broken release branch.
- If the script reports no affected deployable apps, treat that as a valid no-op.
- If a release branch has diverged from `main`, stop and fix the divergence before retrying.
