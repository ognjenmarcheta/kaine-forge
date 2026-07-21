---
"@repo/api": patch
"@repo/db": patch
---

Assistant review fixes:

- `@repo/api`: scope assistant conversation lookups to the owning user so same-organization members can no longer read or continue another user's conversation, send the latest window of messages (instead of the oldest 50) to the model, warn at startup when `API_CORS_ORIGINS` is unset in production, and drop the unused `noteId` field from `CreateTodoInput`.
- `@repo/db`: add indexes for assistant conversations and messages (migration `0009`).
