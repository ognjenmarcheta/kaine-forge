---
"@repo/web": patch
---

Signing out now shows the unsynced-changes warning when the browser cannot list or read a sync
Outbox store. Before, an unreadable store counted as empty, so the sign-out deleted it without
asking.
