---
"@repo/desktop": minor
"@repo/web": patch
---

The desktop app keeps synced Todos and Notes in a SQLite database per User and Organization, so a
restart with no network shows them. The shell runs its own database commands with one connection
per file, because `tauri-plugin-sql` pools connections and splits a transaction. Signing out
deletes the User's database files.
