---
"@repo/api": patch
---

Fail closed when `API_CORS_ORIGINS` is missing or empty in production so credentialed CORS cannot reflect any origin.
