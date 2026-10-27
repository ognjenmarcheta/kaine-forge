---
"@repo/api": patch
"@repo/db": patch
---

A deleted Organization's storage purge that keeps failing (for example a denied logo delete) no longer blocks later Organizations. Migration `0014` adds `organization_storage_purges.attempted_at`; the storage sweep takes never-tried rows first and moves a failed row behind them.
