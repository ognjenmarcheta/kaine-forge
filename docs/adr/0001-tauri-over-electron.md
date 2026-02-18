# ADR 0001: Desktop Shell Uses Tauri (Not Electron)

- Status: Accepted
- Date: 2026-02-18

## Context

Desktop app requirements include a native shell around the web app with lower runtime overhead and modern Rust-backed packaging.

## Decision

Use Tauri v2 as the desktop shell implementation.

## Consequences

- Pros:
  - lower memory footprint compared to Electron-based Chromium bundling
  - native Rust ecosystem integration
  - simpler packaging posture for this repo direction
- Cons:
  - Rust toolchain required for contributors touching desktop builds
  - different plugin/runtime model from Electron
