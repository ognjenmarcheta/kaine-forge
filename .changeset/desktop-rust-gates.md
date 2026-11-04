---
"@repo/desktop": patch
"@repo/desktop-native": patch
---

The Tauri crate joins the PR Rust Checks job (clippy, tests and `cargo deny` on Linux) and formats
locally through `pnpm --filter @repo/desktop format`; its obsolete `custom-protocol` feature is
gone and its crate version follows the package. The workspace profiles optimise only GPUI Kit's
text and layout crates in dev and record the release-profile decision.
