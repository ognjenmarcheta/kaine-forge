---
"@repo/api": minor
"@repo/db": minor
---

Add the server half of offline sync for Todos and Notes. Every write to `todos` and `notes` now
gets a per-organization Sync Version from a trigger, and a delete leaves a Tombstone. The new
`syncPull(cursor, first)` query returns the changes after a cursor. The new
`syncPush(input)` mutation applies an Outbox batch once per idempotency key and accepts
client-generated ids. `Todo` gains a `noteId` field. Housekeeping prunes old Tombstones and push
receipts (`RETENTION_SYNC_TOMBSTONES_DAYS`, `RETENTION_SYNC_RECEIPTS_DAYS`).
