# Desktop installers

Both desktop apps ship installers for macOS, Windows and Linux. The Tauri app (`apps/desktop`)
uses Tauri's own bundler; the native GPUI app (`apps/desktop-native`) uses `cargo-packager`
(ADR 0025). Neither app is a Docker app, so neither has a `release/<app>` branch: the installers
are attached to the GitHub Release of the app's version tag.

## What is built

| OS      | Tauri app (`apps/desktop`)        | Native app (`apps/desktop-native`)  |
| ------- | --------------------------------- | ----------------------------------- |
| Linux   | `.deb`, `.rpm`, `.AppImage`       | `.deb`, `.AppImage` (no `.rpm` yet) |
| macOS   | `.app`, `.dmg` (universal binary) | `.app`, `.dmg`                      |
| Windows | NSIS `-setup.exe`, `.msi`         | NSIS `-setup.exe`, `.msi`           |

The Tauri app's version is the package version: `tauri.conf.json` points `version` at
`apps/desktop/package.json`. The native app's `Cargo.toml` version follows its package version
through `scripts/sync-cargo-version.mjs`, which `pnpm release:version` runs after
`changeset version`; `scripts/sync-cargo-version.test.mjs` fails when the two drift.

## Build them locally

```bash
pnpm --filter @repo/desktop bundle
pnpm --filter @repo/desktop-native bundle
```

For the Tauri app, Turbo builds the web app first, then `tauri build` writes the installers for the current OS under
`.cargo-target/release/bundle/` (`deb/`, `rpm/`, `appimage/`, `dmg/`, `macos/`, `nsis/`, `msi/`). For the native app, `cargo build --release` runs first, then `cargo packager --release` reads `[package.metadata.packager]` in `apps/desktop-native/Cargo.toml` and writes the installers for the current OS under `.cargo-target/release/bundle/native/`. Install the packager once with `cargo install cargo-packager --locked --version 0.11.8`; the CI jobs do the same and cache it.
On macOS, `pnpm --filter @repo/desktop bundle -- --target universal-apple-darwin` builds a
universal binary after `rustup target add aarch64-apple-darwin x86_64-apple-darwin`; the output
then sits under `.cargo-target/universal-apple-darwin/release/bundle/`.

Prerequisites beside the Rust toolchain: on Linux the Tauri stack
(`libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdg-utils`) and the GPUI
packages (`docs/troubleshooting.md`); on Windows, NSIS and WiX are downloaded by Tauri on first
use; on macOS, Xcode command-line tools.

## How a release attaches them

The Release workflow runs on `main`. Changesets tags the version (`@repo/desktop@<version>`,
`@repo/desktop-native@<version>`), the workflow creates the GitHub Release, and
`scripts/release-desktop-apps.mjs` turns the tags at HEAD into the installer matrix (the list of
desktop apps, their workspaces and the macOS build arguments lives there). Three jobs, one per OS, check out the tag, build the installers
and `gh release upload` them to that release. Deep Checks builds the same installers on every
scheduled run, so a bundler regression shows up before a release needs them.

## Signing

Signing is secret-driven and optional. When the macOS job finds the Tauri signing secrets
(`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, `APPLE_TEAM_ID`), Tauri signs and notarizes the `.app` and `.dmg`. Without
them, and on Windows until a `signCommand` is configured, the installers are unsigned and the job
appends a line saying so to the release notes. Unsigned installers open behind the usual
Gatekeeper and SmartScreen warnings.

The native app's macOS package is built for the runner's architecture (Apple silicon on hosted
runners); cargo-packager has no universal-binary mode. It also produces no `.rpm`: that gap and
the items below each get an issue naming the trigger. Out of scope until a certificate exists:
Windows code signing, notarization, auto-update (`TAURI_SIGNING_PRIVATE_KEY`,
`cargo-packager-updater`), and app-store distribution.
