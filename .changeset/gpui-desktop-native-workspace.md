---
"@repo/desktop-native": minor
"@repo/desktop": patch
"@repo/config": patch
---

Add `apps/desktop-native`, a native desktop app built with GPUI through GPUI Kit, and a root
Cargo workspace with a pinned toolchain, shared lints, rustfmt, clippy and cargo-deny policy that
the Tauri crate joins. Cargo output moves from `.tauri-target/` to the repo-root
`.cargo-target/`. The PR gate gains a Rust Checks job, Security a cargo-deny job, and Deep
Checks native builds on Linux, macOS and Windows (ADR 0025).
