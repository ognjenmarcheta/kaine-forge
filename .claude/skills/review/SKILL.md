---
name: review
description: Perform code-review style analysis focused on bugs, regressions, missing tests, security, and template-rule violations.
argument-hint: diff, branch, PR, or path
---

<!-- GENERATED FROM .ai; DO NOT EDIT DIRECTLY. Run pnpm ai:sync. -->

# Review Workflow

Use this skill when asked to review code or assess a patch.

## Review Priorities

Findings should lead the response, ordered by severity:

- Correctness bugs and regressions.
- Security issues, especially auth, CORS, secrets, tenancy, and file access.
- Missing organization scoping or authorization.
- Missing tests for risky behavior.
- GraphQL schema/codegen drift.
- TypeScript looseness, especially `any`.
- UI violations of `DESIGN_SYSTEM.md`, including hardcoded styles or untranslated strings.
- Template-specific mistakes that would leak project-specific assumptions downstream.

## Method

- Read the diff and surrounding code.
- Verify assumptions against `MONOREPO_GUIDE.md` and `DESIGN_SYSTEM.md`.
- Reference exact files and tight line ranges.
- Do not spend review budget on harmless style unless it can hide a bug.
- If no issues are found, say so and mention residual test gaps.
