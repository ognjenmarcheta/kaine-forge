---
"@repo/api": patch
---

One Note module (`features/notes/notes.module.ts`, `ctx.notes`) owns Note reads, writes, input normalization, and `note:*` events. The Note resolvers and the assistant tools go through it; `ctx.workflows` and the Note workflow adapter are gone, and the assistant tools no longer take a scope.
