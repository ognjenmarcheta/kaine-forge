---
"@repo/api": minor
"@repo/auth": patch
---

`@repo/api` adds `API_TRUSTED_PROXY_HOPS` (positive integer, default 1, read only with `API_TRUST_PROXY=true`). The client IP for rate limits, Audit Events, and sessions is the `x-forwarded-for` entry that many positions from the right, so a platform proxy in front of the web image's nginx (Traefik → nginx → API) needs `2`. A request with fewer entries than hops uses the socket address instead of a client-supplied entry. `RateLimitConfig` gains a required `trustedProxyHops`, and `resolveRateLimitKey` takes `{ trustProxy, trustedProxyHops }` in place of the `trustProxy` boolean.

`@repo/auth` records a new session's IP address from the API's request IP when one is set, instead of better-auth's own `x-forwarded-for` parsing, which found no IP behind two proxies.
