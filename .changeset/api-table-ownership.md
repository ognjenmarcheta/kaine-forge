---
"@repo/config": minor
"@repo/api": patch
---

`api/context-boundaries` now checks table imports and the shared kernel. An `apps/api` feature
imports only its own context's `@repo/db/schema` tables, better-auth's tables, and the foreign
tables that `API_FOREIGN_TABLES` names for it. A kernel file imports no feature (ADR 0026).
