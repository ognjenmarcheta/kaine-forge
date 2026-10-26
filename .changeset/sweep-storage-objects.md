---
"@repo/db": minor
"@repo/api": minor
---

The API now sweeps storage objects of deleted and abandoned Attachments on an interval (`STORAGE_SWEEP_INTERVAL_MS`, default 15 minutes; `STORAGE_SWEEP_ENABLED=false` turns it off). A Postgres advisory lock keeps it to one replica, and a new `files.purged_at` column records each removed object. A failed delete is retried on the next run, and the sweep never deletes a key outside the row's organization prefix.
