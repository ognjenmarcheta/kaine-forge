---
"@repo/config": minor
---

Enforce token-only styling in lint: ban hardcoded hex colors and arbitrary Tailwind color values (`bg-[#fff]`, `rgb()`/`hsl()`) across web, desktop, `@repo/ui`, mobile, and `@repo/mobile-ui` source so all color flows through `--ds-*` design tokens. The rules compose with the existing i18n and native-`<button>` bans rather than replacing them. The current codebase has zero violations, so the rules ship as errors.
