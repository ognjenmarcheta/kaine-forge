---
"@repo/storage": minor
"@repo/api": patch
---

Harden Attachment uploads. The presigned PUT signs `Content-Length` and no longer carries a checksum of an empty body, so S3 accepts the upload and rejects any other size. Upload and download URLs get separate, shorter expiries (`S3_UPLOAD_URL_EXPIRY`, `S3_DOWNLOAD_URL_EXPIRY`). Confirm checks the object's leading bytes against its MIME type and deletes a rejected object. A file name whose extension does not match its MIME type is rejected, and non-image downloads carry `Content-Disposition: attachment`.
