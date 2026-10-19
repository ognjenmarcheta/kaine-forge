---
"@repo/desktop": patch
---

Build `@repo/web` through the Turbo dependency edge instead of an inline `pnpm --filter` call. Run the desktop build with `pnpm exec turbo run build --filter=@repo/desktop`.
