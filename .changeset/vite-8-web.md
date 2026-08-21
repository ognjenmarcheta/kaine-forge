---
"@repo/web": minor
"@repo/ui": patch
---

Upgrade web tooling to Vite 8 (Rolldown-powered build, lightningcss minification). Replace the invalid `var()` media query in `globals.css` with its literal breakpoint value: media queries cannot consume custom properties, so the sub-768px layout block previously never matched in any browser and now applies as intended. Closes the vite workstream from the 2026-08 security triage.
