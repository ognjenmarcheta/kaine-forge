---
"@repo/api": patch
---

One Todo module (`features/todos/todos.module.ts`, `ctx.todos`) owns Todo reads, writes, input normalization, `todo:*` events, and Attachment cleanup on delete. AI generation, `addTodoToNote`, the assistant tools, the batch loader, and the Attachment target check all go through it; `TodoWorkflowAdapter` and the second create path are gone.
