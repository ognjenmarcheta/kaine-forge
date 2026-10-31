# @repo/sync

## 0.1.0

### Minor Changes

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

## 0.0.0

- Initial scaffold via `pnpm create:package`
