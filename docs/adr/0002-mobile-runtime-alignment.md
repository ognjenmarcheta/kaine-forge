# ADR 0002: Expo SDK 54 Dependency Alignment Is Mandatory

- Status: Accepted
- Date: 2026-02-18

## Context

Expo runtime compatibility depends on tight version alignment (React, React Native, Reanimated, Worklets, navigation packages). Divergence caused runtime mismatches and startup failures.

## Decision

Pin mobile runtime dependencies to Expo SDK 54-compatible versions and validate with:

```bash
pnpm --filter @repo/mobile exec expo install --check
```

## Consequences

- Pros:
  - avoids JS/native mismatch runtime errors
  - predictable behavior in Expo Go/dev clients
- Cons:
  - slower adoption of newest upstream package versions
  - requires deliberate upgrade workflow when bumping SDK

## Status update (2026-09-09)

The pins now track Expo SDK 55: `apps/mobile/package.json` depends on `expo` `~55.0.28`, and the `catalog:mobile` entries in `pnpm-workspace.yaml` follow its bundled native modules. The decision is unchanged; only the target SDK moved.
