---
"@repo/api": patch
"@repo/sync": patch
---

`pnpm create:feature --sync` scaffolds the server half of offline sync for a new feature. To make
that one entry per list, the API's sync pull reads every table in `SYNCED_TABLES` and its push
dispatches through `MUTATIONS`; behavior for Todos and Notes is unchanged. Tombstones name their
entity as the upper-case `sync_entity` value. The sync client accepts pulled deletions of any
entity and skips the ones it does not sync, so a server that syncs a new entity never breaks an
older client.
