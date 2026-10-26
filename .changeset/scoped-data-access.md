---
"@repo/db": minor
"@repo/api": patch
---

Add `@repo/db/testing` (`createTestDatabase()`: PGlite with every migration applied) and the `Database` type. The API builds one scoped data-access module per request (`context.data.ts`) that alone writes the organization predicate, stamps inserts, clamps pagination, and escapes search phrases; feature adapters no longer import the `db` singleton.
