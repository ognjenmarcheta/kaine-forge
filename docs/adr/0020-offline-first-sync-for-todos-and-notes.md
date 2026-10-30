# ADR 0020: Offline-first sync for Todos and Notes

- Status: Proposed
- Date: 2026-10-30

## Context

Every client is online-only today. Reads fail without a network, and a write that fails is lost. Clients use `graphql-request` with generated TanStack Query v5 hooks and a memory cache; there is no local database and no service worker. Feature writes hard-delete rows, and `updated_at` is set by hand in each write.

The owner chose:

- **Clients:** web, desktop (the web build in a Tauri v2 webview), and mobile (Expo SDK 55). Mobile syncs Todos only, because mobile has no Notes (`CONTEXT.md` Template platform surfaces).
- **Scope:** Todos and Notes. Account, Organization, and billing screens stay online-only.
- **Client library:** TanStack DB collections, `@tanstack/offline-transactions` for the Outbox, and SQLite persistence for rows.
- **Conflicts:** the server applies queued mutations in arrival order, as field-level patches. A delete wins. A rejected mutation rolls back on the client.

These are new foundational libraries, so they need an ADR (`MONOREPO_GUIDE.md` §3). A timeboxed spike (milestone 0, not merged) checked each runtime before this decision.

## Decision

### Client libraries

| Package                                                        | Pin today (mature) | Target (RC)  | Used by                        |
| -------------------------------------------------------------- | ------------------ | ------------ | ------------------------------ |
| `@tanstack/db`                                                 | `0.15.2`           | `1.0.0-rc.1` | `@repo/sync`, all clients      |
| `@tanstack/react-db`                                           | `0.5.12`           | `1.0.0-rc.1` | web, mobile                    |
| `@tanstack/offline-transactions`                               | `1.1.4`            | `1.2.0`      | all clients (Outbox)           |
| `@tanstack/browser-db-sqlite-persistence` (+ `wa-sqlite` 1.x)  | `0.2.37`           | `1.0.0-rc.1` | web                            |
| `@tanstack/tauri-db-sqlite-persistence` (+ `tauri-plugin-sql`) | `0.2.37`           | `1.0.0-rc.1` | desktop                        |
| `@tanstack/expo-db-sqlite-persistence` (+ `expo-sqlite`)       | `0.2.37`           | `1.0.0-rc.1` | mobile                         |
| `@tanstack/query-db-collection`                                | not used           | `1.5.0`      | not adopted (see Alternatives) |

- **Release-age gate.** The 1.0.0-rc.1 set was published on 2026-10-29. `pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` (3 days), so pnpm refuses it before 2026-11-01 16:09 UTC. Do not add a `minimumReleaseAgeExclude` entry for it. Milestone 2 installs the RC set once the gate admits it; until then the 0.x set above is the newest installable one. The public exports differ only slightly between the two sets (rc.1 drops a few internal `@tanstack/db` exports and adds `LiveQueryOptions`; `offline-transactions` 1.2.0 adds `MutationValueCodec`). Note that `offline-transactions@1.1.4` pins `@tanstack/db` exactly at `0.15.2`, while 1.2.0 declares it as a peer.
- **Peer ranges fit the catalog.** React `>=18` (catalog `^19.2.8`; mobile `19.2.0`), `@tanstack/query-core ^5.90.15` (catalog `@tanstack/react-query ^5.104.5`), `expo-sqlite ^55.0.10 || ^57.0.0` (added with `expo install` as `~55.0.20`, ADR 0002), `@tauri-apps/plugin-sql ^2.3.2` (latest `2.6.0`), `@journeyapps/wa-sqlite ^1.4.1` (use the newest 1.x, `1.7.2`; 2.x is outside the range). The `react-native` and `@react-native-community/netinfo` peers of `offline-transactions` are optional.
- **RC risk.** TanStack DB is a release candidate. The persistence packages had more than 40 releases before rc.1. Mitigations: pin exact versions in the catalog, keep every TanStack import behind `@repo/sync` and the per-app adapters, and keep the existing CRUD mutations as the online path. If the RC breaks a milestone, stop and report, and do not patch around the library in app code.

### Storage per runtime (spike results, 2026-10-30)

The spike used the 0.x set above. Each run opened a persisted collection, wrote a row, queued an Outbox entry whose push failed, and then restarted the runtime.

| Runtime                                  | Rows (persisted collection) | Outbox                        |
| ---------------------------------------- | --------------------------- | ----------------------------- |
| Web, Chromium 156                        | Works (OPFS + wa-sqlite)    | Works (`IndexedDBAdapter`)    |
| Desktop, Linux WebKitGTK 2.52.6          | **Fails** (no OPFS)         | Works (`IndexedDBAdapter`)    |
| Desktop, `tauri-plugin-sql`              | Not run (see below)         | Not needed: IndexedDB works   |
| Desktop, WebView2 (Windows)              | Not tested                  | Not tested                    |
| Desktop, WKWebView (macOS)               | Not tested                  | Not tested                    |
| Mobile, Expo SDK 55, Android 16 emulator | Works (`expo-sqlite`)       | Works (`AsyncStorageAdapter`) |
| Mobile, iOS                              | Not tested                  | Not tested                    |

- **Web.** OPFS with wa-sqlite (`OPFSCoopSyncVFS` in a worker) and `BrowserCollectionCoordinator` worked on the dev server and in the production build. Rows survived a browser restart. The Outbox entry survived it too and was retried with the same idempotency key.
- **WebKitGTK** is the engine Tauri v2 uses on Linux. The spike drove it through its GObject bindings with a persistent data directory, on `http://localhost` (as `tauri dev` serves) and on a secure `tauri://localhost` custom scheme (as a production build serves). `navigator.storage.getDirectory` is missing, so the adapter throws `PersistenceUnavailableError`. With WebKit's `FileSystem`, `AccessHandle`, and `StorageAPI` features forced on, `createSyncAccessHandle` throws `NotSupportedError`. IndexedDB works on both origins.
- **`tauri-plugin-sql`** (crate and npm `2.6.0`) was not run. Tauri does not compile on the spike machine without `libwebkit2gtk-4.1-dev` and the GTK development packages, which were not installed. Only the adapter API (`createTauriSQLitePersistence({ database })` over `@tauri-apps/plugin-sql`) was read. Milestone 4 must prove this path before it merges.
- **WebView2, WKWebView, and iOS** were not tested, because no Windows or macOS machine was available. The Tauri SQL path does not depend on the webview, so desktop uses it on every OS.
- **Mobile** ran as a dev build (`expo run:android`). Hermes had no `crypto.randomUUID` until `react-native-random-uuid` loaded. Rows and the Outbox entry survived a cold restart, and the retry reused the same idempotency key. The `expo-network` detector reported the online state. Its offline-to-online transition was **not** verified: with the radios off, the dev build cannot load its bundle from Metro. Milestone 5 checks it with a release build in airplane mode.

So the adapters are:

- **Web:** `@tanstack/browser-db-sqlite-persistence` with `BrowserCollectionCoordinator` for multiple tabs; the Outbox on `IndexedDBAdapter`.
- **Desktop:** `@tanstack/tauri-db-sqlite-persistence` over `tauri-plugin-sql` (the Rust crate plus a `sql:` capability in `apps/desktop/src-tauri/capabilities`). The desktop build stays the web build: the web app picks the Tauri adapter when it runs inside Tauri. The Outbox stays on IndexedDB, which works in WebKitGTK.
- **Mobile:** `@tanstack/expo-db-sqlite-persistence` on `expo-sqlite`. `react-native-random-uuid` is imported first from a new `apps/mobile/index.ts` entry, before `expo-router/entry`. The package has native code, so it needs a dev build, not Expo Go. The Outbox uses an `AsyncStorageAdapter` copied from the TanStack docs into the app, and a custom `onlineDetector` built on the installed `expo-network`. Import the executor from the main `@tanstack/offline-transactions` entry: the `/react-native` entry only adds a default detector, and that detector imports `@react-native-community/netinfo` statically, so the entry needs NetInfo installed even when a custom detector is passed.
- **Bundle cost on web:** the OPFS worker asset is about 1.7 MB (about 0.7 MB gzip) and loads only when the local database opens. TanStack DB and the Outbox add about 90 KB gzip to the page.

### Server protocol

The server work is additive. Existing CRUD mutations, API-key clients, and online paths keep working.

- **Sync Version.** A per-Organization counter table, `organization_sync_versions`. `BEFORE INSERT/UPDATE` triggers on `todos` and `notes` increment it and stamp the row's `sync_version` column. The counter row lock serializes writes per Organization, so commit order matches version order. Client and server clocks never order changes.
- **Tombstones.** Rows stay hard-deleted. An `AFTER DELETE` trigger writes a Tombstone (`sync_tombstones`: Organization, entity, entity id, Sync Version). Triggers also catch cascades that skip app code, such as `todos.note_id ON DELETE SET NULL`.
- **`syncPull(cursor)`** returns the rows and Tombstones with a Sync Version after the cursor, a new cursor, `hasMore`, and `resetRequired`. The cursor is opaque and bound to the Organization, like the existing page cursors. A cursor from another Organization, or one older than Tombstone retention, returns `resetRequired`. The client feeds the result into a custom TanStack DB sync collection.
- **`syncPush(idempotencyKey, mutations)`.** `mutations` is a list of a `@oneOf` input (Todo and Note create, update, delete). The server replays them in order, through the existing module functions, so validation, `authorize`, and `ScopedData` Organization scoping stay in one place. A receipts table stores the result per idempotency key, so a replay returns the stored result. Each mutation reports applied or rejected with a code.
- **Client IDs.** Creates carry a client-generated UUID (`crypto.randomUUID()`), so a Note and its Todos can be created offline and linked. The server validates the UUID. A replay of the same create by the same creator in the same Organization returns the existing row; any other collision is rejected. A client ID never reaches another Organization's row.
- **No toggles offline.** Offline paths set state (`update { completed }`); they never call `toggleTodo`, which is not idempotent.

### Conflict resolution

- The server applies Pending Changes in arrival order. An update writes only the fields the user changed. Two users who change different fields both keep their change. For the same field, the change that arrives last wins.
- **Delete wins.** An update or delete of a row that is gone returns `NOT_FOUND`, and the client drops that Pending Change.
- A permission or validation reject (`FORBIDDEN`, `INVALID`) is non-retriable: the client rolls back that Pending Change and shows a translated message. A `401` pauses the Outbox and keeps it.
- **Known ceiling:** two offline edits of the same Note body keep only the later one. A GitHub issue records this ceiling and the trigger to move to versioned rejects or a text CRDT.

### Identity binding of local stores

- Each device keeps one local database and one Outbox per `(userId, organizationId)`. The store name contains both ids. A store is never shared across Users or Organizations, so an Organization switch opens a different store and never shows another Organization's rows.
- The server never trusts the store's scope: `syncPush` and `syncPull` resolve the Authenticated Organization Scope from the session or bearer token, as every other operation does.
- Logout deletes the local data of that User. If Pending Changes remain, logout first warns how many are not synced.

### Removing the capability (downstream adopters)

A product that does not want offline sync removes it in one change:

1. Remove `packages/sync` and its catalog entries (the TanStack DB set, `wa-sqlite`, `tauri-plugin-sql`, `expo-sqlite`, `react-native-random-uuid`).
2. Return the Todo and Note screens to the generated Query hooks, which stay in place. Remove the sync status indicator, the service worker, the `sync.graphql` operations, and run `pnpm generate`.
3. Remove `apps/api/src/features/sync` and the `syncPull`/`syncPush` schema.
4. Add a new migration that drops the triggers, `sync_version` columns, and sync tables. Do not edit shipped migrations (ADR 0008).
5. Desktop: remove the `tauri-plugin-sql` crate and capability. Mobile: restore `"main": "expo-router/entry"`.

## Alternatives Considered

- **TanStack Query `persistQueryClient` with paused mutations.** Smallest change, but it persists query caches, not rows. It has no durable ordered Outbox across tabs, no leader election, and no idempotency keys, and an offline create cannot be linked to another offline create.
- **`@tanstack/query-db-collection`.** It refetches the whole collection on every change, so it cannot apply Tombstones or a delta pull. A custom sync collection fed by `syncPull` does that.
- **Replicache, PowerSync, ElectricSQL, Zero.** Each brings its own server or sync service, and some a hosted dependency or a commercial license. The template keeps GraphQL Yoga, `ScopedData`, and the existing module functions as the only write path.
- **Soft deletes (`deleted_at` on every table).** Every existing query would need a filter, and one missed filter leaks deleted data. Tombstones in a separate table keep hard deletes.
- **`updated_at > last_synced_at` pulls and last-write-wins by client clock.** `updated_at` is set by hand, clocks drift, two rows can share a millisecond, and a late commit can carry an older timestamp than rows already pulled. A per-Organization Sync Version has none of these gaps.
- **OPFS in the Tauri webview.** It fails on Linux WebKitGTK (see the matrix), so one desktop adapter on `tauri-plugin-sql` is simpler than one per OS.

## Consequences

- Pros:
  - Todos and Notes work offline on web and desktop, and Todos on mobile. Changes show at once and reach the server in order when the network returns.
  - The server stays the only authority: replays go through the existing module functions and Organization scoping.
  - Pulls fetch only what changed, and no client clock orders changes.
- Cons:
  - New foundational dependencies on a release-candidate library, and a native SQLite plugin on desktop and mobile.
  - Mobile now needs a dev build for the UUID polyfill; Expo Go cannot run the app.
  - Full-Organization sync, no partial sync: a very large Organization loads slowly on first use. A GitHub issue tracks this ceiling.
  - Note bodies are last-write-wins at the field level.
  - Pubsub pokes reach one API process, so clients also pull on a slow interval.
  - Two persistence paths on desktop and web (OPFS in browsers, Tauri SQL in the desktop shell) need tests on each.
