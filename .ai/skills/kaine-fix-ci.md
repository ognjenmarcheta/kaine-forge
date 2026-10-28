---
name: kaine-fix-ci
description: Investigate failing CI by reading logs, reproducing locally, and implementing the smallest safe fix.
argument-hint: PR number, run URL, check name, or failure log
---

# Fix CI Workflow

Use this skill when a GitHub Actions check fails or when local validation differs from CI.

## Investigation

- Identify the failing workflow, job, command, and first meaningful error.
- Prefer CI logs over guesses.
- Reproduce locally with the closest scoped command. When the cause is not obvious from the log, continue with `kaine-debug`.
- Check whether failures come from generated drift, missing lockfile updates, GraphQL generation, formatting, or environment assumptions.

## Known causes in this repo

- TS2307 for a new `@repo/*` subpath export: add its `paths` entry to `tsconfig.base.json`.
- An E2E shell crash after a new shell-level GraphQL query: specs mock `/graphql`, so mock the query in the E2E helpers. Make the shell degrade quietly when the query fails.
- A migration or `drizzle/meta` conflict after merging `main`: regenerate with `pnpm db:generate`. Do not hand-merge the snapshots.
- A PGlite or jsdom test that times out only on the Release runner: give the suite a longer timeout (`vi.setConfig({ testTimeout })` or the package's `testTimeout`).

## Common Commands

- AI tooling doctor: `pnpm ai:doctor`
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
