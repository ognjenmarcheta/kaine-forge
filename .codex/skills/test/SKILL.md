---
name: test
description: Write or verify tests for a specified system under test using Kaine Forge conventions.
argument-hint: SUT path, behavior, or failing test
---

<!-- GENERATED FROM .ai; DO NOT EDIT DIRECTLY. Run pnpm ai:sync. -->

# Testing Workflow

Use this skill when adding tests, repairing tests, or proving behavior.

## Before Writing Tests

- Read `MONOREPO_GUIDE.md` testing, GraphQL, package-boundary, and FDD rules.
- Identify the system under test and its owning workspace.
- Prefer focused unit or integration tests near the implementation.
- Use Vitest for package, API, web, and mobile logic tests.
- Use Playwright only for user workflows or browser behavior.
- For GraphQL behavior, prefer testing resolvers/adapters and generated client flows rather than mocking unrelated layers.

## Commands

- Auth package: `pnpm --filter @repo/auth test`
- API app: `pnpm --filter @repo/api test`
- Web app: `pnpm --filter @repo/web test`
- Mobile app: `pnpm --filter @repo/mobile test`
- E2E: `pnpm --filter @repo/e2e test:e2e`
- Full tests: `pnpm test`

## Expectations

- Assert behavior, not implementation trivia.
- Keep fixtures small and explicit.
- Do not use `any` in tests.
- Keep user-facing strings in translations even for test-only rendered components.
- When adding GraphQL operations, run `pnpm generate` and commit generated outputs.
