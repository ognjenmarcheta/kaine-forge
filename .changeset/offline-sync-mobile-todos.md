---
"@repo/mobile": minor
"@repo/sync": minor
---

Mobile Todos now read from and write to the local sync collection, so they keep working offline
and sync when the network returns. The Outbox lives in AsyncStorage under a per-User and
per-Organization prefix, and expo-network tells the engine when the device is online. A new
`entry.ts` installs an expo-crypto `crypto.randomUUID` polyfill before the app starts. The Todos
screen shows the sync status, a refused change shows its message, an attachment's link is fetched
when it is opened, and signing out deletes the User's local sync data after a warning when changes
are not synced yet.
