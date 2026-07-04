---
"@repo/auth": minor
"@repo/api": minor
"@repo/db": minor
---

Serve /api/auth/\* through better-auth's node handler; ServerAuth slims to the session/read facade; signup invariants move to better-auth database hooks. users.password_hash becomes nullable so better-auth-created users need no legacy hash.
