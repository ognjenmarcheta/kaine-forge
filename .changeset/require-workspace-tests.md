---
"@repo/config": patch
---

Add a monorepo-alignment test asserting every testable workspace ships at least one vitest test, so the blanket `--passWithNoTests` flag can no longer let a test-free package pass green. `apps/e2e` is excluded (it ships Playwright specs). All 17 workspaces pass today.
