---
"@repo/api": patch
---

Route assistant and note write paths through the todo and note workflows. Deleting a todo through the AI assistant skipped attachment cleanup, so the file rows were orphaned at `status = 'uploaded'` and their storage objects were never reclaimed — the equivalent GraphQL mutation did not have this problem. Creating or updating a todo through the assistant, and adding a todo to a note through the `addTodoToNote` mutation, also skipped title and description normalization, so a whitespace-only title could be stored where the mutation rejects it.

The workflows now live on the request context, so every feature that writes a todo shares one set of guards instead of each wiring its own.
