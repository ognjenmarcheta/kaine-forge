---
"@repo/mobile": patch
"@repo/sync": patch
"@repo/web": patch
---

Pin the TanStack DB 1.0 RC set for offline sync (`@tanstack/db` and `@tanstack/react-db` 1.0.0-rc.1, `@tanstack/offline-transactions` 1.2.0). The sync engine now waits for a local change with `transaction.when("settled")`, and `useLiveQuery` no longer takes a dependency array.
