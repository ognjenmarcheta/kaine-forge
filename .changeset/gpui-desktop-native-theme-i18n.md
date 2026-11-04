---
"@repo/desktop-native": minor
"@repo/theme": minor
"@repo/translation": minor
"@repo/config": patch
---

Theme and translate the native desktop app. `pnpm theme:build` now also writes a GPUI Kit
theme set and a resolved token file into `apps/desktop-native/assets/theme`, and the new
`pnpm translation:build` writes rust-i18n locale files with exactly the keys the Rust sources use.
The app loads both, follows the system appearance, and takes `--theme` and `--locale` for manual
checks (ADR 0025).
