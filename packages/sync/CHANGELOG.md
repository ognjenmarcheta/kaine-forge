# @repo/sync

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
