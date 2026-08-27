---
name: kaine-review
description: Perform code-review style analysis focused on bugs, regressions, missing tests, security, performance, and template-rule violations.
argument-hint: diff, branch, PR, or path
---

# Review Workflow

Use this skill when asked to review code or assess a patch.

## Contract

- Apply the checklist in **`REVIEW.md`** (canonical source `.ai/review.md`). That file is the shared human/agent contract for what must be true.
- Use the priorities below for **ordering and severity**, not as a replacement for the checklist.
- If the same domain rejection will recur, recommend `kaine-encode-knowledge` instead of only requesting a one-off fix.

## Review Priorities

Findings should lead the response, ordered by severity:

- Correctness bugs and regressions.
- Security issues, especially auth, CORS, secrets, tenancy, and file access.
- Missing organization scoping or authorization.
- Missing tests for risky behavior.
- GraphQL schema/codegen drift.
- Performance regressions: N+1 queries, unbounded fetching, missing pagination.
- TypeScript looseness, especially `any`.
- Unnecessary complexity, scope creep, or speculative abstractions beyond what was requested.
- UI violations of `DESIGN_SYSTEM.md`, including hardcoded styles or untranslated strings.
- Template-specific mistakes that would leak project-specific assumptions downstream.
- Domain language drift vs `CONTEXT.md`.

## Finding Labels

The ladder above orders findings; labels state the author's obligation. Label every finding:

- `Critical:` — blocks merge: security hole, data loss, broken behavior.
- No prefix — required; must be fixed before merge.
- `Consider:` — worth thinking about, not required.
- `Nit:` — minor; the author may ignore it.
- `FYI:` — context only; no action needed.

Labels apply to review responses only. GitHub issue titles keep the `kaine-scorecard` rule: no priority prefixes.

## Method

- Read the diff and surrounding code.
- Read the tests first: do they cover the change, test behavior rather than implementation, and would they fail on a regression? Missing or implementation-coupled tests are findings.
- For GitHub PRs, use `gh pr diff` or the PR’s own commits. Do **not** size or judge a stale branch with `git diff main..HEAD` / `main...HEAD` — that range includes every commit main gained since the fork as deletions and can turn a tiny PR into a fake massive revert.
- Size the change: ~100 changed lines is good, ~300 is acceptable for one logical change, ~1000 means ask the author to split before deep review. Deletions and mechanical or automated refactors are exempt.
- Walk `REVIEW.md` sections relevant to the diff (skip unrelated sections briefly).
- Verify assumptions against `MONOREPO_GUIDE.md`, `DESIGN_SYSTEM.md`, and `CONTEXT.md`.
- Reference exact files and tight line ranges.
- Do not spend review budget on harmless style unless it can hide a bug.
- Check the author's verification story: which commands ran, and what evidence backs the claimed result.
- Close with a verdict: approve when the change definitely improves overall code health, even if imperfect; request changes only while `Critical:` or unprefixed findings remain. Do not block on personal preference.
- If no issues are found, say so and mention residual test gaps.
