---
"@repo/config": minor
---

Add the `anti-slop/no-comment-provenance` lint rule: a comment states a reason, constraint, or
invariant, never a PR or issue number, a date, or change history. Existing violations are frozen
in per-workspace `eslint-suppressions.json` files, which lint fails on when an entry goes stale.
