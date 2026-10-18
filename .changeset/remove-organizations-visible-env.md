---
"@repo/api": patch
---

Stop parsing the unused `ORGANIZATIONS_VISIBLE` environment variable. The flag value comes only from `@repo/feature-flags`.
