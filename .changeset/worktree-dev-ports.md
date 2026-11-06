---
"@repo/web": patch
---

The Vite dev server reads its port from `WEB_PORT` in the root `.env` (default 3000), so a linked
worktree can run `pnpm dev` beside the primary checkout. Builds and the shipped app do not change.
