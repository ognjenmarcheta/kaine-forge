---
"@repo/mobile": patch
---

Validate the mobile client environment at boot with a zod schema (`apps/mobile/src/env.config.ts`), mirroring the API and web validators. A misconfigured `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_GRAPHQL_URL` (e.g. a value missing its `http(s)://` protocol) now fails fast with a clear message, and a blank value falls back to its default instead of overriding it. The auth config and GraphQL HTTP/WS clients read the validated env via `getMobileEnv()`.
