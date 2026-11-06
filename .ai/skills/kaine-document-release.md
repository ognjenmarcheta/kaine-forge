---
name: kaine-document-release
description: Check product docs (README, MONOREPO_GUIDE.md, CONTEXT.md, docs/) against a range of merged changes and report docs that the changes made wrong or incomplete. Use after merges to main, before a release, or when asked whether the docs still match the code. Fixes docs only on request.
argument-hint: commit range or PR numbers, default the last 20 commits on origin/main
---

# Document Release Workflow

Use this skill to find product docs that shipped changes left behind. The range is a commit range (`<from>..<to>`) or a list of PR numbers. With no argument, use the last 20 first-parent commits on `origin/main`.

## Goal and non-goals

- Goal: list each doc that a change in the range made wrong or incomplete, with the change, the doc line, and the correct fact.
- Do not edit `CHANGELOG.md` files. Changesets generates them.
- Do not edit generated AI outputs (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, installed skills). Edit the `.ai/` source and use `kaine-sync-docs`.
- Do not rewrite a shipped ADR in `docs/adr/`. When a decision changed, propose a new ADR that supersedes it.
- Do not reword prose that is correct. Do not fix code, tests, or unrelated docs.

## Steps

1. **Collect public-surface changes in the range.** Record each added, changed, renamed, or removed item:
   - GraphQL types, fields, and arguments in `apps/api/schema.graphql`.
   - `scripts` in the root and workspace `package.json` files.
   - Env keys in `.env.example` and `apps/*/src/env.config.ts`.
   - `exports` in `packages/*/package.json`.
   - CLI commands and flags under `tooling/` and `scripts/`.
2. **Check coverage.** Search `README.md`, `MONOREPO_GUIDE.md`, `CONTEXT.md`, `docs/`, and `docs/agents/` for each item. Classify each item:
   - **documented**: a doc says what it does and how to use it.
   - **mentioned only**: a doc names it but does not say what it does.
   - **missing**: no doc names it. Report it only when a reader needs it (a new script, env key, or flag that a person runs or sets).
3. **Find stale names.** For each renamed or removed identifier, script, file path, or env key, search Markdown prose and code blocks for the old name. A hit outside `CHANGELOG.md`, `docs/archive/`, and shipped ADRs is stale.
4. **Check changesets.** For each `.changeset/*.md` file that the range adds and that still exists, check that its summary says what changed and why a reader cares. Flag a summary that names only a file or a function.
5. **Act.** Report by default. On request, fix with Edit only: the smallest correct change, one doc at a time. When the correct wording is not clear from the code, report the question instead of guessing.

## Canonical commands

```bash
git fetch origin main
git log --first-parent --oneline -20 origin/main                # default range
RANGE="origin/main~20..origin/main"
git diff -M --name-status "$RANGE"                               # renames (R), deletions (D)
git diff "$RANGE" -- apps/api/schema.graphql
git diff "$RANGE" -- package.json '*/package.json' '*/*/package.json'
git diff "$RANGE" -- .env.example 'apps/*/src/env.config.ts'
git diff "$RANGE" -- 'tooling/**/*.cli.ts' 'tooling/**/cli.args.ts' 'scripts/*.mjs'
git diff --name-only --diff-filter=A "$RANGE" -- .changeset/    # then keep the files that still exist
grep -rn --include='*.md' -e '<old-name>' README.md MONOREPO_GUIDE.md CONTEXT.md docs/
grep -rln --include='*.md' -e '<new-item>' README.md MONOREPO_GUIDE.md CONTEXT.md docs/
```

For a PR list, get each merge commit with `gh pr view <n> --json mergeCommit --jq .mergeCommit.oid` and diff it against its first parent.

## Report

Give a table with one row per finding: item, change (commit or PR), doc and line, status (stale, missing, mentioned only, weak changeset), and the correct fact. Then list wording questions and the items you checked and found documented. State the range and the commands you ran.
