---
"@repo/sync": patch
---

Engine writes (`createTodo`, `updateTodo`, `deleteTodo`, and the Note ones) now resolve once the
Outbox stores the change, not as soon as it shows. A page that closes right after a change no
longer loses it, and the screens' "saved" notices now mean the change is safe on the device.
