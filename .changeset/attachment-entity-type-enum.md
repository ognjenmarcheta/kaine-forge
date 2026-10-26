---
"@repo/api": minor
"@repo/db": minor
"@repo/storage": minor
"@repo/web": patch
"@repo/mobile": patch
---

Type the Attachment entity type as the `AttachmentEntityType` GraphQL enum (`general`, `todo`) and a `files.entity_type` pgEnum. Migration `0010` maps any other stored value to `general` first; the API now rejects unknown entity types at the GraphQL boundary.
