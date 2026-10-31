---
"@repo/sync": minor
"@repo/web": minor
"@repo/db": minor
"@repo/translation": minor
---

Add `@repo/sync`, the client half of offline sync. It holds Todo and Note collections fed by
`syncPull`, and an Outbox that replays local changes through `syncPush` in order. Web Todos now
read from and write to the local collection, so they keep working offline and sync when the
network returns. The header shows the sync status. A change to a Todo's Attachments now gives
the Todo a new Sync Version (migration 0028).
