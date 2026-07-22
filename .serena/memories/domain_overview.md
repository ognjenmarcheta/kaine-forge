<!-- GENERATED FILE. Do not edit directly. Run: pnpm ai:install -->

# Frontend Domain Overview

- Product/domain vocabulary and invariants live in root `CONTEXT.md`; shared review contract is `REVIEW.md` (from `.ai/review.md`).
- `apps/web` is the React/Vite browser application. Route-level work should generally start in `apps/web/src/features/` and `apps/web/src/routes/`.
- `apps/desktop` is a Tauri shell around the web app. Desktop-specific changes usually concern packaging, native integration, or Tauri config rather than duplicate UI.
- `apps/mobile` is the Expo/React Native client. It shares auth/data/translation packages with web but must use `@repo/mobile-ui`, not `@repo/ui`.
- `apps/api` owns GraphQL schema composition, resolvers, and authenticated organization-scoped data access. Its REST auth surface under `/api/auth/*` also covers organization invitations, password reset, and email verification.
- Shared logic should move into `packages/*` only when it is genuinely cross-app. Default to keeping feature code close to the consuming app.
- Before touching UI, check whether the change belongs in an app feature, `@repo/ui`, or `@repo/mobile-ui`; do not blur web/mobile runtime boundaries.
