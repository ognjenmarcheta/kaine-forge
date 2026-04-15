---
name: rebase
description: Safely rebase a feature branch onto main with conflict-resolution and verification rules.
argument-hint: target branch, usually main
---

# Rebase Workflow

Use this skill when updating a feature branch from `main`.

## Safety Rules

- Do not rebase with uncommitted changes unless the user explicitly wants you to handle them.
- Never discard user changes.
- Read conflict hunks carefully and preserve both the user's intent and current template conventions.
- Do not use destructive git commands such as `git reset --hard` unless explicitly requested.

## Steps

1. Run `git status --short`.
2. Fetch the latest refs.
3. Rebase onto `origin/main` unless the user gives a different target.
4. Resolve conflicts surgically.
5. Run focused checks for touched workspaces.
6. Run `pnpm ai:sync:check` if assistant files are in scope.
7. Summarize conflicts, resolutions, and verification.

Prefer non-interactive git commands where possible.
