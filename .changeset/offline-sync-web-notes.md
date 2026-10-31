---
"@repo/sync": minor
"@repo/web": minor
"@repo/translation": minor
---

Web Notes and their checklists now read from and write to the local sync collections, so they
keep working offline. A Note gets a client id when it is first saved, and checklist Todos made
offline link to it in order. A session check that cannot reach the API keeps the last session.
Signing out deletes this device's sync data for the User, and warns first when changes are not
synced yet.
