---
"@repo/api": minor
"@repo/sync": minor
"@repo/web": minor
"@repo/translation": minor
---

Two offline edits of the same Note body no longer lose one of them (issue #801). A body edit now
sends `baseBody`, and `syncPush` merges it line by line into the current body under a row lock.
Edits of the same lines are refused with `CONFLICT`, and the web app shows both versions so the
second writer keeps theirs or the current one. `SyncRejection` now carries the refused `change`.
