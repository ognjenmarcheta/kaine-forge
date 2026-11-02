---
"@repo/sync": minor
"@repo/web": minor
"@repo/mobile": minor
"@repo/translation": minor
---

The sync status now says why sync stops. Web and desktop show "Offline" with no network: the
engine gets `createBrowserOnlineDetector(window)`, because TanStack's default detector counted any
visible tab as online. A request with no response, or a gateway error, shows the new `unreachable`
state ("Can't reach the server – retrying"); other failures keep "Sync failed – retrying". A failure
now wins over Syncing while changes wait. `engine.retry()` pulls and sends waiting changes at once,
and the web header and mobile Todos header offer it as Retry now.
