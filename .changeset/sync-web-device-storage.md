---
"@repo/sync": minor
"@repo/web": minor
"@repo/mobile": patch
---

The web app keeps synced Todos and Notes in a device database (SQLite on OPFS), one per User and
Organization, shared by every open tab. A reload while offline shows them, and the next pull asks
only for the changes after the stored cursor. `createSyncEngine` takes an optional `persistence`;
without it, or where the browser has no OPFS, rows stay in memory as before. Signing out deletes
the User's device databases. Screens key their live queries on the new `engine.id`, so an
Organization switch never reuses a collection for another engine.
