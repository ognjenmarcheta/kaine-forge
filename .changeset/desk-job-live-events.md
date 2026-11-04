---
"@repo/desk": patch
"@repo/desk-ui": patch
---

A desk job page now updates while the job runs. The server sent `job-updated` and `job-removed`
events, but the browser did not listen for them, so a job page stayed on its first state until a
reload.
