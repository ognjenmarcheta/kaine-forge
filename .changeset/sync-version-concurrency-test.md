---
"@repo/db": patch
"@repo/api": patch
---

Add a real-Postgres test that proves Sync Versions commit in order under concurrent writers: a
paging sync pull misses no change, and one Organization's writes never wait on another's. It
runs in CI's e2e job (issue #803). `@repo/db/testing` gains `createPostgresTestDatabase`.
