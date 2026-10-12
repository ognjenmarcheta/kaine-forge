---
name: kaine-test
description: Required before writing, changing, or planning tests — pass the test value gate, then write or verify tests using Kaine Forge conventions.
argument-hint: SUT path, behavior, or failing test
---

# Testing Workflow

Use this skill whenever you add, change, repair, or plan tests, including tests inside an implementation, bug fix, or plan. To sweep existing tests for low-value proof, use `kaine-test-audit`.

## Value gate

Answer these before each new or changed test. If a question has no answer, do not write the test; state the decision in the handoff.

1. Which observable behavior, invariant, or contract does it protect?
2. Which credible regression makes it fail?
3. Why does no existing test catch that regression? Each contract has one owning test at the strongest boundary. Extend a table case or shared fixture before adding a file. A second layer needs a distinct risk, such as the real-database tenancy proof next to a resolver test.
4. Does it need a test-only export, flag, or injection seam? If so, test at the real boundary instead.

A behavior-preserving refactor must not break a good test.

### Reject

- Tests that read source or doc text instead of running the code.
- Copied inventories: export, slot, or file lists that restate the subject.
- Call-shape assertions on internal collaborators when a boundary test already proves the result.
- Mocks that supply the value the test then asserts.
- Expected values computed by the code under test, and self-comparisons.
- Negative tests that pass on an unrelated guard, or rejections the code never reaches.
- Names that promise behavior the assertions do not check.
- One bug replayed at every layer it crosses.

### Keep

Independent contracts stay even when they are slow or static: public API and GraphQL schema, config, migrations, security and tenancy, i18n, design tokens, and package exports. A failing existing test can be a product bug; fix the owner instead of deleting the test.

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
- For a bug, write the reproduction test first and watch it fail before the fix.
- Prefer real dependencies, then fakes, then stubs, then mocks. Tenancy tests run the real resolver (`apps/api/src/features/notes/notes.tenancy.test.ts`).
- Keep fixtures small and explicit.
- Do not use `any` in tests.
- Keep user-facing strings in translations even for test-only rendered components.
- When adding GraphQL operations, run `pnpm generate` and commit generated outputs.
- In the handoff, name the contract each new test protects and any test you chose not to write.
