---
"@repo/desk": minor
---

A Claude run now records the model that ran as `resolvedModel` in `runs.jsonl`. `pnpm desk stats` and the Runs view group by it, so a new CLI default or a moved alias starts a new row.
