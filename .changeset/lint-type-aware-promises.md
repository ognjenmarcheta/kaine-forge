---
"@repo/config": minor
"@repo/api": patch
"@repo/web": patch
"@repo/mobile": patch
---

Add type-aware ESLint via the TypeScript project service: `no-floating-promises`, `no-misused-promises`, and `await-thenable` as errors across the repo (excluding files not covered by any tsconfig). Fix the 14 real violations it surfaced — `void`-wrapping async JSX event handlers and fire-and-forget lifecycle/teardown calls, and extracting the API server's async request handler — with no behavior change. `require-await` is intentionally not enabled (noise on async functions without `await`, e.g. resolvers).
