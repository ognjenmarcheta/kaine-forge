---
"@repo/web": patch
"@repo/mobile": patch
"@repo/todos": patch
---

Fix the broken web/desktop build by adding the missing `@repo/auth/form` Vite (and mobile Vitest) alias, correct the default `API_CORS_ORIGINS` to the web dev port, migrate organization-scoped query keys to `createActiveOrganizationQueryKey` from `@repo/query` (deprecating `createTodoListQueryKey`), and harden template adoption to cover the `kaineforge`/`kaine_forge` identity forms, mobile auth prefixes, docs, and AI-source files so `template:adopt --check` passes after a by-the-book adoption.
