<!-- GENERATED FROM .ai; DO NOT EDIT DIRECTLY. Run pnpm ai:sync. -->

# Project Overview

Kaine Forge is a reusable monorepo template built with Turborepo and pnpm. It provides a production-oriented starter for:

- `apps/web`: React 19 and Vite single-page app.
- `apps/api`: Node.js GraphQL Yoga API.
- `apps/desktop`: Tauri v2 desktop shell for the web app.
- `apps/mobile`: Expo and React Native mobile app.
- `apps/e2e`: Playwright end-to-end tests.
- `packages/auth`: better-auth with organization support.
- `packages/db`: Drizzle ORM, PostgreSQL schema, migrations, and seed.
- `packages/ui`: React DOM design system primitives.
- `packages/mobile-ui`: React Native design system primitives.
- `packages/translation`: i18n resources and helpers.
- `packages/query`, `packages/storage`, `packages/feature-flags`, `packages/logger`, and `packages/config`: shared infrastructure.

The repository is a template. Keep defaults generic, avoid product-specific assets or services, and make downstream customization easy.
