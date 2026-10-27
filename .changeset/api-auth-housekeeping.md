---
"@repo/api": minor
---

Purge expired auth rows on an interval: expired sessions and verification rows, and Invitations more than 30 days past expiry. One API replica runs it at a time through a Postgres advisory lock. It is on by default; `HOUSEKEEPING_ENABLED=false` turns it off and `HOUSEKEEPING_INTERVAL_MS` changes the hourly interval.
