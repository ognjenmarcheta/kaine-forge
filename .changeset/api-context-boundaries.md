---
"@repo/config": minor
---

New lint rule `api/context-boundaries`: an `apps/api` feature imports another bounded context only
along an edge of the context map in `eslint/api-contexts.js`, and only through that feature's
`.module` or `.type` file (ADR 0025).
