---
"@repo/desktop": minor
"@repo/desktop-native": patch
---

Build installers for the Tauri desktop app. `tauri.conf.json` turns bundling on with the
package version and icons, `pnpm --filter @repo/desktop bundle` builds the installers for the
current OS, Deep Checks builds them on Linux, macOS and Windows on every scheduled run, and the
Release workflow attaches them to the app's GitHub Release, signed when the Apple secrets exist.
`pnpm release:version` now also copies the native app's package version into its Cargo
manifest and lockfile (ADR 0025).
