---
"@repo/storage": patch
"@repo/web": patch
"@repo/mobile": patch
---

Add a client-safe `@repo/storage/client` entry and move the web and mobile upload hooks onto it. The root barrel re-exported the S3 client, which pulled `@aws-sdk/client-s3` and its `node:https` handler into the Expo bundle and broke `expo export`. ESLint now rejects server-only package entries in client apps, and pull requests that touch shared packages or the lockfile run the mobile export.
