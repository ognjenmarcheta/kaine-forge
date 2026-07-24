---
"@repo/desktop": patch
---

Opt the Tauri desktop `build` out of Turbo caching via a package-level `apps/desktop/turbo.json`. Its Rust output (`src-tauri/target`) was never declared as a Turbo output, so a cache hit would have restored a stale or absent binary. Cargo's own incremental cache handles desktop rebuilds.
