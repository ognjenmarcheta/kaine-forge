---
"@repo/api": patch
"@repo/storage": patch
---

Deleting a Todo now removes its Attachment objects from storage in the background, with each delete bounded by a timeout, so a slow object store no longer delays the delete or its event. An upload linked to a Todo outside the Active Organization is rejected, and file listing clamps a negative offset. `deleteObject` accepts an optional `abortSignal`.
