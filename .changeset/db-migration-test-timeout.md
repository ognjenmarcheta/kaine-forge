---
"@repo/db": patch
---

Give the `files.entity_type` migration test the 30 s timeout that other PGlite migration tests use, so it no longer times out on a loaded CI runner and blocks the Release workflow.
