---
"@repo/storage": minor
"@repo/api": minor
"@repo/web": minor
"@repo/ui": patch
---

Uploaded image Attachments are re-encoded without metadata (EXIF, GPS) and get a WebP thumbnail (`FileInfo.thumbnailUrl`), shown in the web attachment list. Users can set an avatar and organization admins can set a logo: both are Public Assets, re-encoded as square WebP and served from a separate public bucket through a CDN (`S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL`). The storage sweep also clears unconfirmed Public Asset uploads.
