---
"@repo/api": minor
---

The API now shuts down gracefully on `SIGTERM` or `SIGINT`. It stops accepting connections, lets in-flight requests finish, closes GraphQL WebSocket clients with code 1001, stops the Attachment sweep, and closes the database pool, then exits with code 0. A new optional `API_SHUTDOWN_TIMEOUT_MS` (default 8000) bounds the drain; when it expires, the API force-closes the remaining connections and exits with code 1.
