---
name: fix-ci
description: Investigate failing CI by reading logs, reproducing locally, and implementing the smallest safe fix.
argument-hint: PR number, run URL, check name, or failure log
---

# Fix CI Workflow

Use this skill when a GitHub Actions check fails or when local validation differs from CI.

## Investigation

- Identify the failing workflow, job, command, and first meaningful error.
- Prefer CI logs over guesses.
- Reproduce locally with the closest scoped command.
- Check whether failures come from generated drift, missing lockfile updates, GraphQL generation, formatting, or environment assumptions.

## Common Commands

- Assistant drift: `pnpm ai:sync:check`
- Formatting: `pnpm format:check`
- Lint: `pnpm lint`
- Types: `pnpm typecheck`
- Tests: `pnpm test`
- Core build: `pnpm run build:core`

## Fixing

- Make the smallest code or config change that addresses the root cause.
- Do not silence tests or weaken type rules to make CI green.
- Add or update tests when the failure reveals uncovered behavior.
- Summarize the failing check, root cause, fix, and validation.
