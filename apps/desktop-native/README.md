# @repo/desktop-native

The native desktop app, built with GPUI through [GPUI Kit](https://gpui-kit.com). It is the
thin native client of the template: sign-in through the API's bearer session and the Todos list
of the active Organization (`CONTEXT.md`, Template platform surfaces). The Tauri app in
`apps/desktop` stays the web-parity desktop surface (ADR 0001); this app is the native-UI
surface (ADR 0025).

## Run

```bash
pnpm --filter @repo/desktop-native dev
```

Cargo output goes to the repo-root `.cargo-target/` (root `.cargo/config.toml`). Linux needs
the GPUI system packages listed in `docs/troubleshooting.md`; `pnpm preflight` checks them.

## Check

`pnpm --filter @repo/desktop-native check` runs `cargo fmt --check`, `cargo clippy -D warnings`,
`cargo check`, `cargo test`, and the pnpm-side prettier, eslint, tsc and vitest gates. The Rust
rules live in the root `Cargo.toml` (`[workspace.lints]`), `clippy.toml` and `rustfmt.toml`;
see `MONOREPO_GUIDE.md` §14.
