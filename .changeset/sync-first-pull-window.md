---
"@repo/api": minor
"@repo/sync": minor
"@repo/web": minor
"@repo/mobile": minor
---

A first sync of a large Organization loads only the newest 500 Todos and Notes (issue #800).
`syncPull` takes `window`, payloads name lists with older rows in `older`, and the new
`syncPullOlder` loads them page by page. The engine stores where each list continues and exposes
`loadOlder`; the web and mobile lists load older rows past the local ones, online only. Every later
change of any row still syncs.
