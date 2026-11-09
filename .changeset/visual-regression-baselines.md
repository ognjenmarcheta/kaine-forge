---
"@repo/e2e": patch
---

Compare the sign-in, sign-up, and todos screens against committed screenshot baselines, rendered
in the pinned Playwright container through `pnpm --filter @repo/e2e test:visual`. Pull requests
run the check with the `ci:run-visual` label; merge queue and manual runs always run it.
