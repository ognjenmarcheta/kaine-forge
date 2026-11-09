---
"@repo/sync": patch
---

A pull now waits until the engine has read the stored rows' cursor. Before, a change the Outbox
replayed at start pulled first, and the Todo and Note lists could show empty after a reload.
