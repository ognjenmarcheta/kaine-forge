---
"@repo/desktop-native": minor
---

Package the native desktop app with cargo-packager. `pnpm --filter @repo/desktop-native bundle`
builds the release binary and writes the installers for the current OS (deb, AppImage and pacman
on Linux; app and dmg on macOS; NSIS and msi on Windows) under `.cargo-target/release/bundle/native`.
Deep Checks packages the app on every scheduled run and the Release workflow attaches the
installers to the app's GitHub Release (ADR 0025).
