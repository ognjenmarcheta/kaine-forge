---
name: kaine-review
description: Perform code-review style analysis focused on bugs, regressions, missing tests, security, and template-rule violations.
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
- TypeScript looseness, especially `any`.
- Unnecessary complexity, scope creep, or speculative abstractions beyond what was requested.
- UI violations of `DESIGN_SYSTEM.md`, including hardcoded styles or untranslated strings.
- Template-specific mistakes that would leak project-specific assumptions downstream.
- Domain language drift vs `CONTEXT.md`.

## Method

- Read the diff and surrounding code.
- Walk `REVIEW.md` sections relevant to the diff (skip unrelated sections briefly).
- Verify assumptions against `MONOREPO_GUIDE.md`, `DESIGN_SYSTEM.md`, and `CONTEXT.md`.
- Reference exact files and tight line ranges.
- Do not spend review budget on harmless style unless it can hide a bug.
- If no issues are found, say so and mention residual test gaps.
