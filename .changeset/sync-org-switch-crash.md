---
"@repo/sync": patch
---

Switching Organization while the Todos or Notes screen is open no longer crashes with
`SourceCollectionIdReuseError`. Each sync engine now gives its collections their own ids, which a
mounted TanStack DB 1.0 live query requires; Pending Changes saved on the device are unaffected,
because the Outbox stores them by collection name.
