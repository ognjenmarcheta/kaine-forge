---
"@repo/api": patch
"@repo/auth": patch
"@repo/db": patch
---

Clear fixable Trivy CRITICAL findings in the API Docker image (shell-quote, tar, vitest, esbuild) via workspace overrides and catalog bumps, and align drizzle-orm with better-auth peers.
