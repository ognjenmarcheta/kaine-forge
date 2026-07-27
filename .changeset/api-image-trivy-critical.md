---
"@repo/api": patch
"@repo/auth": patch
"@repo/db": patch
---

Clear fixable Trivy CRITICAL findings in the API Docker image via workspace overrides (shell-quote, tar, esbuild), catalog bumps (vitest, drizzle-orm), and drop the unused base-image npm (nested tar) from the API runner stage.
