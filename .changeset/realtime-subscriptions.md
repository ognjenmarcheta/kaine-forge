---
"@repo/api": patch
"@repo/web": patch
---

The API builds its organization-filtered subscription resolvers from one map of fields to `PubSubEventMap` events. The web uses the generated subscription documents through `useLiveTodos` and `useLiveNotes`, so the hand-written subscription strings are gone, and the Todo subscriptions select only `id`.
