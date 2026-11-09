# @repo/sync

## 0.2.1

### Patch Changes

- a9b1aad: A pull now waits until the engine has read the stored rows' cursor. Before, a change the Outbox
  replayed at start pulled first, and the Todo and Note lists could show empty after a reload.

## 0.2.0

### Minor Changes

- a9a2d2c: A first sync of a large Organization loads only the newest 500 Todos and Notes (issue #800).
  `syncPull` takes `window`, payloads name lists with older rows in `older`, and the new
  `syncPullOlder` loads them page by page. The engine stores where each list continues and exposes
  `loadOlder`; the web and mobile lists load older rows past the local ones, online only. Every later
  change of any row still syncs.
- a9a2d2c: Two offline edits of the same Note body no longer lose one of them (issue #801). A body edit now
  sends `baseBody`, and `syncPush` merges it line by line into the current body under a row lock.
  Edits of the same lines are refused with `CONFLICT`, and the web app shows both versions so the
  second writer keeps theirs or the current one. `SyncRejection` now carries the refused `change`.
- 3e8bb66: The sync status now says why sync stops. Web and desktop show "Offline" with no network: the
  engine gets `createBrowserOnlineDetector(window)`, because TanStack's default detector counted any
  visible tab as online. A request with no response, or a gateway error, shows the new `unreachable`
  state ("Can't reach the server – retrying"); other failures keep "Sync failed – retrying". A failure
  now wins over Syncing while changes wait. `engine.retry()` pulls and sends waiting changes at once,
  and the web header and mobile Todos header offer it as Retry now.
- 1aa632d: The web app keeps synced Todos and Notes in a device database (SQLite on OPFS), one per User and
  Organization, shared by every open tab. A reload while offline shows them, and the next pull asks
  only for the changes after the stored cursor. `createSyncEngine` takes an optional `persistence`;
  without it, or where the browser has no OPFS, rows stay in memory as before. Signing out deletes
  the User's device databases, and signing in as another User deletes the previous User's stored rows. Screens key their live queries on the new `engine.id`, so an
  Organization switch never reuses a collection for another engine.

### Patch Changes

- db42d07: Engine writes (`createTodo`, `updateTodo`, `deleteTodo`, and the Note ones) now resolve once the
  Outbox stores the change, not as soon as it shows. A page that closes right after a change no
  longer loses it, and the screens' "saved" notices now mean the change is safe on the device.
- 0a0832a: Switching Organization while the Todos or Notes screen is open no longer crashes with
  `SourceCollectionIdReuseError`. Each sync engine now gives its collections their own ids, which a
  mounted TanStack DB 1.0 live query requires; Pending Changes saved on the device are unaffected,
  because the Outbox stores them by collection name.
- ebffe67: Pin the TanStack DB 1.0 RC set for offline sync (`@tanstack/db` and `@tanstack/react-db` 1.0.0-rc.1, `@tanstack/offline-transactions` 1.2.0). The sync engine now waits for a local change with `transaction.when("settled")`, and `useLiveQuery` no longer takes a dependency array.

## 0.1.0

### Minor Changes

- 6b672bd: Mobile Todos now read from and write to the local sync collection, so they keep working offline
  and sync when the network returns. The Outbox lives in AsyncStorage under a per-User and
  per-Organization prefix, and expo-network tells the engine when the device is online. A new
  `entry.ts` installs an expo-crypto `crypto.randomUUID` polyfill before the app starts. The Todos
  screen shows the sync status, a refused change shows its message, an attachment's link is fetched
  when it is opened, and signing out deletes the User's local sync data after a warning when changes
  are not synced yet.
- 6f6690c: Web Notes and their checklists now read from and write to the local sync collections, so they
  keep working offline. A Note gets a client id when it is first saved, and checklist Todos made
  offline link to it in order. A session check that cannot reach the API keeps the last session.
  Signing out deletes this device's sync data for the User, and warns first when changes are not
  synced yet.
- 6980f5e: Add `@repo/sync`, the client half of offline sync. It holds Todo and Note collections fed by
  `syncPull`, and an Outbox that replays local changes through `syncPush` in order. Web Todos now
  read from and write to the local collection, so they keep working offline and sync when the
  network returns. The header shows the sync status. A change to a Todo's Attachments now gives
  the Todo a new Sync Version (migration 0028).

### Patch Changes

- 88654b6: `pnpm create:feature --sync` scaffolds the server half of offline sync for a new feature. To make
  that one entry per list, the API's sync pull reads every table in `SYNCED_TABLES` and its push
  dispatches through `MUTATIONS`; behavior for Todos and Notes is unchanged. Tombstones name their
  entity as the upper-case `sync_entity` value. The sync client accepts pulled deletions of any
  entity and skips the ones it does not sync, so a server that syncs a new entity never breaks an
  older client.

## 0.0.0

- Initial scaffold via `pnpm create:package`
