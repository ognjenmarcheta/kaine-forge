---
"@repo/desk": minor
"@repo/desk-ui": minor
"@repo/translation": minor
---

The Scorecard view tracks scorecard work end to end. Scorecard and audit jobs label the issues they
file `source:scorecard` and `source:audit`, the ledger PR gets `source:scorecard`, and ship writes
each filed issue's number on its finding. The view reads the scorecard's issues live from GitHub
and shows Recently solved (with the dimension's score change), each finding's issue, PR, and desk
run, Fix with desk, findings sorts, and a confirmed backfill of the label on older issues.
