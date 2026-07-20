---
"@repo/api": minor
"@repo/db": minor
"@repo/config": patch
"@repo/translation": patch
---

Template audit follow-through fixes:

- `@repo/api`: batch `Todo.attachments` and `Note.todos` through per-request DataLoaders, surface attachment lookup failures instead of returning `[]`, and reject `createTodo` inputs whose `noteId` belongs to another organization.
- `@repo/db`: add organization-scoped indexes on `todos`, `notes`, and `files` (migration `0008`).
- `@repo/config`: enforce `@typescript-eslint/no-explicit-any` as an error.
- `@repo/translation`: locale-consistency test now discovers namespaces from disk, covering `assistant`, `notes`, and `storage`.
