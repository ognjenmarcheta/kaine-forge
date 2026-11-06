---
"@repo/desk": minor
"@repo/desk-ui": minor
"@repo/translation": minor
---

The agent desk has a Scorecard view. `GET /api/scorecard` reads the monorepo health ledger of the
checkout through one contract, and the view shows the selected run's scores and their change, the
overall trend, each dimension's reasons, the open findings, and the diagrams. The desk preferences
also choose the theme (Byte Forge or Moss). `pnpm scorecard` no longer writes `scorecard-out/`.
