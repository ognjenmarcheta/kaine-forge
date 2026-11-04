# ADR 0025: Native Desktop App with GPUI Alongside the Tauri Shell

- Status: Accepted
- Date: 2026-11-04

## Context

The template had four surfaces (API, web, mobile, Tauri desktop shell) and every standard was
TypeScript-shaped: no root Cargo workspace, no `rustfmt` or `clippy` gate, no Rust in the PR
gate, and the only Rust was the Tauri shell's five commands, tested on the scheduled macOS job.
The owner wants the template to also build a truly native desktop app in Rust with
[GPUI](https://gpui.rs), the GPU-drawn UI framework behind the Zed editor, with the same rigor
as the other apps: coding standards, gates in `pnpm check` and CI, theme tokens from
`@repo/theme`, translations from `@repo/translation`, generated GraphQL, review rules, skills
and docs.

GPUI is pre-1.0 and ships as a family of crates that move together. [GPUI Kit](https://gpui-kit.com)
(`gpui-kit`) pins the matching GPUI release exactly, re-exports it (`gpui_kit` _is_ gpui), and
adds 75+ components, JSON themes, rust-i18n, AccessKit roles and a headless UI test harness.
Longbridge Pro ships on it on macOS, Windows and Linux.

## Decision

- **A second desktop surface, not a replacement.** `apps/desktop` (Tauri, ADR 0001) stays the
  web-parity shell. `apps/desktop-native` (`@repo/desktop-native`, crate
  `kaine_forge_desktop_native`) is the native-UI surface: a thin client with sign-in through the
  bearer session and the Todos list of the active Organization. `CONTEXT.md` lists both.
- **One root Cargo workspace** (`Cargo.toml`, `Cargo.lock`) for every Rust crate, the Tauri crate
  included: `rust-toolchain.toml` pins the compiler, `rustfmt.toml` (`style_edition = "2024"`),
  `clippy.toml` (unwrap/expect allowed in tests only; Zed's disallowed methods so nothing blocks
  the GPUI executor), `deny.toml` (licences and advisories, run by Security), and
  `[workspace.lints]` that every crate inherits (`all` and `pedantic` at warn under
  `-D warnings`; `dbg_macro`, `todo`, `unwrap_used`, `expect_used`, `print_stdout`,
  `print_stderr`, `redundant_clone` denied). Cargo output lives at the repo-root
  `.cargo-target/` (root `.cargo/config.toml`), outside every pnpm workspace (issue #351).
- **GPUI through the `gpui-kit` facade only,** pinned exactly (`=0.9.0`). One GPUI family per
  app: never mix `gpui`, `gpui-pre`, `gpui-ce` or `gpui-fast`. Dependabot lets gpui patches flow
  and holds minors and majors for a deliberate PR that runs the three-OS Deep Checks.
- **Turbo runs cargo through `package.json` scripts,** the pattern `apps/desktop` already uses,
  so `pnpm check`, `check:affected` and the PR gate keep their shape. Every cargo script
  targets the one crate with `--locked`. The PR gate's `rust-checks` job (fmt for the workspace,
  clippy and tests for the GPUI app) runs when Rust inputs change or Turbo marks a Rust
  workspace affected (ADR 0003); Deep Checks builds the app on Linux, macOS and Windows and
  lints the Tauri crate on macOS. Check Fast excludes `@repo/desktop-native`; the Rust job owns
  it. `pnpm check` therefore needs a Rust toolchain on every machine (`pnpm preflight` says so);
  `pnpm bootstrap` never compiles Rust.
- **Generated inputs, never hand-written in Rust:** theme tokens and a gpui-kit `ThemeSet` per
  theme come from `pnpm theme:build`; locales come from `pnpm translation:build`; GraphQL
  operations use `graphql_client` against `apps/api/schema.graphql`. The same staleness checks
  that guard the TypeScript outputs guard these.
- **No shared `crates/*` and no facade crate yet.** The review rules forbid a layer with a single
  consumer. Theme, i18n and API modules live in the app crate; `members` gains `"crates/*"` the
  day a second Rust consumer exists.
- **Installers for both desktop apps** come from the Release workflow: Tauri's own bundler and
  `cargo-packager` for the GPUI app, attached to the GitHub Release of each app's tag; signing
  is secret-driven and optional.

## Alternatives Considered

- Official `gpui` 0.2.2 alone: no component library, theme or test harness, and the published
  docs lag Zed's main branch.
- Turborepo's experimental `experimentalCargoWorkspaces`: would change the PR gate's shape for an
  experimental flag; revisit when it is stable.
- Per-crate lockfiles and lints (the previous Tauri layout): duplicated advisories and policy.
- A `kf_ui` facade crate: a single-consumer abstraction; exact pins and the generated JSON
  contracts give the same isolation.
- Keeping Rust out of the PR gate: a broken crate or Cargo bump could reach `main` undetected,
  as the Tauri crate could before this ADR.

## Consequences

- Pros:
  - A native desktop app with the template's standards, gates, tokens, translations and docs.
  - Rust gets first-class lint, format, licence and advisory gates; the Tauri crate inherits them.
  - One lockfile and one toolchain for every Rust crate.
- Cons:
  - `pnpm check` needs Rust on every contributor machine, and Linux needs the GPUI system
    packages (`docs/troubleshooting.md`).
  - GPUI compiles slowly; the PR job is cached and skipped on TypeScript-only changes, but a
    cold build takes minutes.
  - GPUI is pre-1.0. Exit trigger: two consecutive gpui-kit releases without a `gpui-pre` bump,
    or a breaking change the kit does not absorb within a release. Fallback: the Tauri shell
    already covers every feature; the native app is a reference surface, not a dependency.
