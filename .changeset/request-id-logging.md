---
"@repo/api": minor
"@repo/logger": minor
---

Every HTTP request to the API, including `/api/auth/*`, `/health`, and 429 responses, now gets a request id. The API reuses an incoming `x-request-id` of 1 to 128 characters from `[A-Za-z0-9._-]` and otherwise generates a UUID. The id comes back in the `x-request-id` response header, which CORS exposes to browser clients, and it is bound to every log line for the request. One `request completed` line per request records `method`, `path`, `status`, `durationMs`, and `requestId`; `/health` completion lines log at `debug`. Each GraphQL WebSocket connection logs a `connectionId` on connect and disconnect. The Yoga `request started` line is removed. `createLogger` now redacts `authorization`, `cookie`, and `set-cookie` header values as `[redacted]`.
