---
"@repo/web": patch
---

Validate the web client environment at boot with a zod schema (`apps/web/src/env.config.ts`), mirroring the API's validator. The app fails fast with a clear message on a misconfigured `VITE_GRAPHQL_URL` (e.g. a value missing its `http(s)://` protocol or leading `/`), and a blank `VITE_GRAPHQL_URL`/`VITE_AUTH_SOCIAL_PROVIDERS` now falls back to its default instead of overriding it with `""`. The GraphQL HTTP/WS clients and the auth config read the validated env.
