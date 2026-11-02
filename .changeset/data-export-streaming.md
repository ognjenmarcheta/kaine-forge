---
"@repo/api": patch
"@repo/storage": minor
---

Data exports now stream (issue #753). The `data.export` job reads each list in keyset pages of
1,000 rows, writes the zip while it reads, and sends it to the private bucket by multipart upload,
so memory no longer grows with the export. The archive cap rises from 256 MiB to 4 GiB of JSON,
which bounds the job's run time; the compressed archive must also stay under 2 GiB, the most the
GraphQL `sizeBytes` Int can report. A larger export still fails with reason `too_large`. Archive
files hold the same rows and the same JSON as before. `@repo/storage` adds `uploadObjectStream`.
