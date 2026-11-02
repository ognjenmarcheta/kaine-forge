---
"@repo/web": patch
---

Signing out now always deletes the User's device database, even when the database was still
opening or closing at that moment: a sign-out waits for a close already under way, and an open
that started before the sign-out removes its own files.
