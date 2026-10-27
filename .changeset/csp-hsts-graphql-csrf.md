---
"@repo/api": minor
"@repo/web": minor
"@repo/mobile": patch
---

`/graphql` now requires the `x-graphql-yoga-csrf` header on GET requests and on POSTs without a content type or with `text/plain`, `application/x-www-form-urlencoded`, or `multipart/form-data`; those requests get 403 without it. JSON POSTs are unaffected, and allowlisted origins may send the header through CORS. The web, desktop, and mobile GraphQL clients send `x-graphql-yoga-csrf: 1`; other GraphQL clients that use GET must send it too. Every API response, including `/api/auth/*`, `/health`, and 429s, carries `X-Content-Type-Options: nosniff`. The web image sends `Content-Security-Policy`, `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`), and `Permissions-Policy` on every response, including `/assets/` and `index.html`. Set `CSP_STORAGE_ORIGINS`, `CSP_PUBLIC_ASSET_ORIGINS`, and, for a cross-origin API, `CSP_API_ORIGINS` on the web container when they differ from the same-origin defaults; otherwise the browser blocks uploads and storage images.
