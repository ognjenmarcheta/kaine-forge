---
"@repo/desk": minor
"@repo/desk-ui": minor
"@repo/translation": minor
---

The agent desk runs the monorepo scorecard as a desk job (ADR 0021). Run scorecard on the
Scorecard view starts it: the engine runs the checks and the GitHub reads, one Claude run scores
with kaine-explorer subagents under a dollar budget and a time limit, and the engine writes the
ledger. At the job's gate you preview the new scores and tick the issues to file; approve files
them and opens a draft PR with the ledger. Desk agent runs can now carry a budget
(`--max-budget-usd`), and issue-less branches are named `KAINE-<type>-<slug>`.
