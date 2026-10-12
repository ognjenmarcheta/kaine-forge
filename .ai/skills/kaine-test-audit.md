---
name: kaine-test-audit
description: Audit existing tests for low-value proof and remove it with evidence. Use for test-bloat sweeps of a file, feature, or workspace.
argument-hint: test file, feature folder, or workspace
---

# Test Audit Workflow

Use this skill when asked to find or remove low-value tests. For new or changed tests, `kaine-test` and its value gate apply instead.

## Goal and non-goals

- Goal: remove proof that protects no contract, in batches grouped by production owner, without losing a contract's only test.
- Never chase deletion counts. A slow or static test is not low-value by itself.
- Report the ledger before you edit. Delete only within the requested scope.
- Only the repository owner merges.

## Steps

1. **Baseline.** Run the scope's tests and record each file's pass or fail state and the test line count. Keep baseline failures in their own list.
2. **Ledger.** Read each test in full, including table rows. Mark every test declaration, with one evidence line each:
   - `R` retain: name the contract and the bug it catches.
   - `F` fix: keep the contract, repair a weak or vacuous assertion.
   - `C` consolidate: name the keeper test that absorbs the assertion.
   - `D` delete: name the proof that remains, or why no contract exists.

   Judge a test by its assertions, not its name. Use the `kaine-test` Reject and Keep lists.

3. **Evidence before `D`.** Read the production owner, its callers, its history (`git log -L`), and the overlapping tests. Missing evidence means no deletion.
4. **Coverage.** Run `pnpm coverage` before and after. Floors live in `vitest.coverage.config.ts`; `packages/auth` and `apps/api` have the smallest margins.
5. **Seams.** Delete test-only production exports, flags, and injection parameters together with the tests that needed them.
6. **Mutation proof.** For each consolidated contract, change the production owner once, confirm the keeper fails, and restore the file exactly.
7. **Baseline failures.** Treat a failing test as a possible product bug. Fix it at the owner in a separate commit, or report it; never delete it to get green.

## Report

List retained contracts, deleted categories and seams, the coverage before and after, the mutations that went red, production and test lines changed (counted separately), and follow-ups.
