---
"@repo/storage": minor
"@repo/api": minor
"@repo/web": patch
"@repo/translation": patch
---

Avatars and organization logos accept AVIF images. `@repo/storage` recognises the AVIF file signature and the `.avif` extension; the API decodes AVIF and publishes it as the usual square WebP. Attachments still accept only JPEG, PNG, GIF, and WebP.
