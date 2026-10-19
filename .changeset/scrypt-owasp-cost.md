---
"@repo/auth": minor
"@repo/db": patch
---

Raise the default scrypt cost to N=16384, r=8, p=5, the 16 MiB variant of the OWASP minimum. Existing hashes keep verifying and are rehashed on the next login.
