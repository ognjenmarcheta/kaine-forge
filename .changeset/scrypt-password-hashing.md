---
"@repo/auth": minor
"@repo/db": patch
---

Replace unsalted SHA-256 password hashing with salted scrypt; legacy hashes still verify and are rehashed on login. Seed data uses the new format.
