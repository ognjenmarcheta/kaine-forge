---
"@repo/desk": minor
---

A `needs-you` history event records why the issue stopped as `code` (`loop-limit`,
`same-failure`, `blocked`, `error`, `pr-round-limit`, `intake`, or `interrupted`), and
`IssueSummary` exposes it as `needsYouCode`. A send-back's history note keeps the owner's words
(`to plan: …`), so a later round can show what was asked.
