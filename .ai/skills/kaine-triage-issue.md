---
name: kaine-triage-issue
description: Verify each finding in a GitHub issue against current code; fix or triage only still-valid items, skip or close the rest with a brief reason, keep changes minimal, and validate.
argument-hint: issue number or URL
---

# Triage Issue Findings

**North star:** Verify each finding in the GitHub issue against current code. Fix or triage only still-valid issues; skip or close the rest with a brief reason; keep changes minimal; validate.

Use this skill when an issue lists findings, review notes, checklists, or architecture debt to dispose — not when the user wants a greenfield feature or a pure code review of a PR (`kaine-review`).

## Load

1. Resolve the issue: `gh issue view <N> --comments` (see `docs/agents/issue-tracker.md`).
2. Read title, body, labels, and prior triage comments. Do **not** invent findings that are not in the issue.
3. Restate the goal. Work from the repo root with scoped `pnpm --filter` commands.

## For each finding

Against **current** main (or the branch you are on — say which):

| Verdict                | Meaning                                                         |
| ---------------------- | --------------------------------------------------------------- |
| **still-valid**        | Reproduced in code/config; fixable with a minimal change        |
| **already-fixed**      | Tree no longer has the problem; skip with evidence              |
| **invalid / outdated** | Claim wrong for this tree; skip with reason                     |
| **process-only**       | Needs human action (merge, secrets, billing); no agent code fix |
| **out-of-scope**       | Real but not this issue; do not expand unless asked             |

## Act

- **Fix** only still-valid defects: surgical diffs, no drive-by refactors.
- **Skip** with a brief reason on the issue when already-fixed, invalid, or out-of-scope.
- **Process-only:** leave open (or keep `ready-for-human`); comment what a human must do.
- **Close** the issue only when every finding is fixed or explicitly disposed **and** the user asked to finish/close (or the issue is fully done and closing is clearly implied).
- Prefer one triage comment summarizing the matrix over many noisy comments.

## Validate

- Run the smallest checks that prove the fix (package tests, `pnpm typecheck` scoped, workflow dry reasoning).
- Never claim fixed/green without naming the command and result.
- End with the repo verification close (what you actually ran).

## Output

Table (or equivalent):

| Finding | Verdict         | Action                  | Evidence                  |
| ------- | --------------- | ----------------------- | ------------------------- |
| …       | still-valid / … | fixed / skipped / human | file, command, or comment |

Then: remaining open items, if any.
