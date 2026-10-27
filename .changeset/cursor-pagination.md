---
"@repo/api": major
"@repo/web": patch
"@repo/mobile": patch
---

Breaking GraphQL change: the `todos`, `notes`, `conversations`, `assistantMessages`, and `files` list fields take `first: Int` and `after: String` instead of `limit` and `offset`, and return a `<Type>Connection` (`TodoConnection`, `NoteConnection`, `AssistantConversationConnection`, `AssistantMessageConnection`, `FileInfoConnection`) with `items` and the shared `pageInfo { hasNextPage endCursor }`. `FilesFilterInput` no longer has `limit` or `offset`. The `auditEvents` query keeps `first` and `after` but returns `AuditEventConnection` (`items`, `pageInfo`) instead of `AuditEventPage` (`events`, `endCursor`, `hasNextPage`). Pass the previous page's `endCursor` as `after` to read the next page. A cursor is opaque and pages by the list's sort key plus `id`, so rows inserted or deleted between two requests no longer shift or repeat a page. A malformed cursor, or one from another list or another Organization, returns the GraphQL error `invalid cursor` (`BAD_USER_INPUT`). The web Todo, Note, assistant, and audit-log lists and the mobile Todo list use the new shape; their UI does not change.
