---
"@repo/api": patch
"@repo/jobs": minor
---

Webhook deliveries of Todo and Note events are now stored in the write's own transaction. An
event is no longer lost when the enqueue fails or the API stops after the commit; a failed enqueue
fails the write instead. `JobQueue.enqueue` accepts `{ connection }` to store a job in a transaction.
