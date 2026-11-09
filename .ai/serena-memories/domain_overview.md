# Frontend Domain Overview

- Product/domain vocabulary and invariants live in root `CONTEXT.md`; shared review contract is `REVIEW.md` (from `.ai/review.md`).
- `apps/web` is the React/Vite browser application. Route-level work should generally start in `apps/web/src/features/` and `apps/web/src/routes/`.
- `apps/desktop` is a Tauri shell around the web app. Desktop-specific changes usually concern packaging, native integration, or Tauri config rather than duplicate UI.
- `apps/mobile` is the Expo/React Native client. It shares auth/data/translation packages with web but must use `@repo/mobile-ui`, not `@repo/ui`.
- `apps/api` owns GraphQL schema composition, resolvers, and authenticated organization-scoped data access. Its REST auth surface under `/api/auth/*` also covers organization invitations, password reset, and email verification.
- `apps/api/src/features/*` is split into seven bounded contexts (CONTEXT.md "Context map", source `packages/config/eslint/api-contexts.js`). Lint rule `api/context-boundaries` allows a cross-context import only along a listed edge and only through `<feature>.module` or `<feature>.type`. Each `@repo/db/schema` table belongs to one context (or to better-auth); a feature imports another context's table only when `API_FOREIGN_TABLES` names it. The shared kernel imports no feature (ADR 0026).
- Shared logic should move into `packages/*` only when it is genuinely cross-app. Default to keeping feature code close to the consuming app.
- Before touching UI, check whether the change belongs in an app feature, `@repo/ui`, or `@repo/mobile-ui`; do not blur web/mobile runtime boundaries.
