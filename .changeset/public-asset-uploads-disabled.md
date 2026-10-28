---
"@repo/api": minor
"@repo/web": patch
"@repo/translation": patch
---

`@repo/api` adds `uploadsEnabled: Boolean!` to the `PublicAssets` type. It is false when `S3_PUBLIC_BUCKET` or `S3_PUBLIC_BASE_URL` is unset. A Public Asset upload to such a deployment now fails with the GraphQL error code `PUBLIC_ASSETS_NOT_CONFIGURED` instead of a masked internal error.

`@repo/web` hides the "Choose image" control for the profile picture and the organization logo when uploads are off, and shows a short note instead of "The image could not be saved" for every image.
