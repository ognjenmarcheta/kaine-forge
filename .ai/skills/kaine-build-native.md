---
name: kaine-build-native
description: Build or change a screen or feature in the native GPUI desktop app (apps/desktop-native) with GPUI Kit, the generated theme tokens and locales, the bearer session and the GraphQL gateway pattern, and prove it with kit UI tests and the native smoke test.
argument-hint: the screen or feature in apps/desktop-native and what it must do
---

# Build a native desktop screen

Read `MONOREPO_GUIDE.md` §14 "Native desktop (GPUI)", `DESIGN_SYSTEM.md` §9.1 and ADR 0025 first. The GPUI Kit coding guide (https://gpui-kit.com/docs/coding-guides) is the component reference; the installed `gpui-kit` crate decides the API.

## Goal and non-goals

Change `apps/desktop-native` so a user sees the requested screen, with every colour and length from the theme and every string from the translations, and leave tests that prove it. Do not add a GPUI crate other than `gpui-kit`, a hex or `px()` literal, a hand-written string, or a shared `crates/*` layer for a single consumer.

## Steps

1. **Gate.** `CONTEXT.md` Template platform surfaces says what the native app ships: sign-in and the Todos list of the active Organization. Anything else needs the task to say so.
2. **Lay out the feature.** `src/features/<feature>/` holds `client.rs` (the API behind a trait, so tests use a fake), `view.rs` (the entity that renders), and one `<feature>.graphql` compiled by `graphql_client` against `apps/api/schema.graphql` (`pnpm generate` first when the schema changed). Register the module in `src/features/mod.rs`.
3. **Strings.** Call `t!("<namespace>.<key>")` with a literal key that `packages/translation/src/locales/en/*.json` defines, then run `pnpm translation:build`; the generated `locales/*.json` carry exactly the keys the Rust sources use and `translation:check` fails on a missing one. A new string is added to `en`, `de` and `sr` first.
4. **Colours and lengths.** Kit components take the kit theme; your own elements read `cx.theme()` (`background`, `foreground`, `muted_foreground`, `danger`, `border`) or `ActiveTokens::global(cx).theme()` (`space`, `radius`, `layout`, `modes`). Use gpui's rem helpers (`gap_2()`, `p_6()`) for spacing; never `px(<number>)`.
5. **Entities.** Keep typed handles; never store `&mut Window`, `&mut App` or `&mut Context<_>`. Child-to-parent references are `WeakEntity`. Store every `Subscription` on its owner. Never `cx.notify()` from `render`. Give rows and controls stable domain ids (`todo-<id>`), never list indices.
6. **Async.** `cx.spawn(async move |this, cx| …)` for API work, `cx.background_executor().spawn` for blocking calls (the keyring), `this.update(cx, …)` to write the result back. The session's bearer token comes from `Session::token()`; never send an organization id.
7. **Tests.** Unit tests in `#[cfg(test)] mod tests`: the client against `gpui_kit::http_client::FakeHttpClient`, pure logic in plain `#[test]`. UI tests with `#[gpui_kit::test]` and `gpui_kit::test::TestWindowExt` (`find`, `click`, `input`, `press`) against a fake gateway, asserting state and visible text. Each test names the contract it protects (`kaine-test`).
8. **Check.** `pnpm --filter @repo/desktop-native check` (cargo fmt, clippy `-D warnings`, cargo check, cargo test, prettier, eslint, tsc, vitest), then `pnpm smoke:native` with `pnpm dev:api` running to see the window through the accessibility tree.

## Gotchas

- Rust cannot name a module file `feature.purpose.rs`; the purpose is the file name inside the feature folder.
- `cargo` scripts target the one crate with `--locked`; a new dependency goes into the root `Cargo.toml` `[workspace.dependencies]` first.
- Generated inputs are embedded with `include_str!`, so a stale `assets/theme/*.json` or `locales/*.json` is a build input: regenerate before you build.
- On Linux, AccessKit joins the AT-SPI bus only when the session flag `org.a11y.Status IsEnabled` is on; `pnpm smoke:native` turns it on. Without it, agent-desktop reports the app as not on the accessibility bus.
- When the OS keyring is unavailable the session stays in memory and the Todos screen shows `auth.session.notSaved`.

## Report

The screen and its states, the keys and tokens it reads, the tests and what each protects, the commands run with their results, and whether `pnpm smoke:native` saw the window.
