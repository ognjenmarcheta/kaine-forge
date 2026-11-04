# Project Overview

Kaine Forge is a reusable monorepo template built with Turborepo and pnpm. It provides a production-oriented starter for:

- `apps/web`: React 19 and Vite single-page app.
- `apps/api`: Node.js GraphQL Yoga API.
- `apps/desktop`: Tauri v2 desktop shell for the web app.
- `apps/desktop-native`: native desktop app built with GPUI through GPUI Kit (Rust; root Cargo workspace, ADR 0025).
- `apps/mobile`: Expo and React Native mobile app.
- `apps/e2e`: Playwright end-to-end tests.
- `packages/auth`: better-auth instance (organization, bearer, two-factor, email OTP, captcha, Have I Been Pwned, passkey, magic link, and API key plugins; ADR 0015) with custom scrypt password hooks, plus the session/read facade over organizations, invitations, password reset, and email verification.
- `packages/db`: Drizzle ORM, PostgreSQL schema, migrations, and seed.
- `packages/email`: provider-agnostic email sending (console adapter, `EMAIL_PROVIDER` factory).
- `packages/ui`: React DOM design system primitives.
- `packages/mobile-ui`: React Native design system primitives.
- `packages/translation`: i18n resources and helpers.
- `packages/todos`: shared Todo workflow and attachment helpers.
- `packages/billing`: provider-neutral billing for Stripe and Paddle.
- `packages/jobs`: typed background jobs on Postgres (pg-boss).
- `packages/sync`: offline sync engine for Todos and Notes (TanStack DB).
- `packages/theme`: design-system themes and tokens.
- `packages/ui-3d`: accessible, on-demand 3D views for web and desktop.
- `packages/query`, `packages/storage`, `packages/persistence`, `packages/feature-flags`, `packages/logger`, and `packages/config`: shared infrastructure.
- `tooling/desk` and `tooling/desk-ui`: the local agent desk that drives a GitHub issue to a draft PR (`pnpm desk:run`).
- `tooling/graphql-codegen`: GraphQL Code Generator configuration.
- `tooling/doc-export`: Markdown to `.docx` or `.pptx` export.

The repository is a template. Keep defaults generic, avoid product-specific assets or services, and make downstream customization easy.
