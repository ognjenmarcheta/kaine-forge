---
"@repo/auth": minor
"@repo/api": minor
---

Add password reset flow: request-reset (tokenized, no account enumeration) and reset (rehash + session invalidation) via /api/auth/request-password-reset and /api/auth/reset-password
