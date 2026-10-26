---
"@repo/api": patch
---

One Attachment module (`features/storage/attachment.module.ts`, `ctx.attachments`) owns an Attachment's row and its stored object together: request, confirm, delete, and the Todo cleanup the Todo module uses. The object store is a port with an S3 adapter and an in-memory adapter, and every object call uses the bucket and key its row records. The storage lifecycle, runtime, and attachment lifecycle modules are gone.
