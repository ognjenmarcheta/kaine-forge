---
"@repo/e2e": patch
"@repo/mobile-ui": patch
"@repo/web": patch
---

Deferred audit backlog hardening:

- `@repo/e2e`: add behavioral Playwright coverage for register/login/logout and todo create/complete/delete flows with i18n-safe selectors, and fix the harness so browser GraphQL goes through the Vite proxy to the e2e API instead of the dev port from `.env`.
- `@repo/mobile-ui`: add a vitest + jsdom test harness with a typed react-native stub and behavior tests for the Button, Checkbox, Badge, Text, and Input primitives.
- `@repo/web`: raise the 12px todo attachment captions from `--ds-text-subtlest` to `--ds-text-subtle` to meet WCAG AA contrast (was 3.22:1 on white).
