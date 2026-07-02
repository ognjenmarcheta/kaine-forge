---
"@repo/db": minor
"@repo/auth": minor
"@repo/api": minor
---

Add optional email verification on signup (AUTH_REQUIRE_EMAIL_VERIFICATION, soft mode): users.email_verified column + migration, hashed verification tokens with atomic claim, and /api/auth/verify-email
