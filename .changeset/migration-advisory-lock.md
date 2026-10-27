---
"@repo/db": patch
---

Serialize `runMigrations` with a session-level Postgres advisory lock, so API replicas that start at the same time no longer race to apply the same migrations.
