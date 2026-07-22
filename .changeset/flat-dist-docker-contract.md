---
"@repo/api": patch
"@repo/auth": patch
"@repo/email": patch
---

Emit flat package dist for Docker: build tsconfigs clear monorepo path mappings, pin rootDir, and exclude tests so main/exports match runtime layout.
