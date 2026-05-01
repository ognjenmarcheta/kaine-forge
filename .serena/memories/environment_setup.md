<!-- GENERATED FILE. Do not edit directly. Run: pnpm ai:install -->

# Environment Setup

Required tools:

- Node.js 20 or newer.
- pnpm 10.29.3 or compatible pnpm 10.
- Docker Desktop or compatible Docker runtime for local Postgres/MinIO and optional image builds.
- Rust toolchain for desktop/Tauri work.

Useful environment variables:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `API_PORT`
- `API_URL`
- `API_CORS_ORIGINS`
- `API_RUN_MIGRATIONS`
- `API_GRAPHQL_MAX_DEPTH`
- `VITE_API_URL`
- `VITE_API_PROXY_TARGET`
- `VITE_GRAPHQL_URL`
- `VITE_ORGANIZATIONS_VISIBLE`
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_GRAPHQL_URL`
- `EXPO_PUBLIC_ORGANIZATIONS_VISIBLE`
- `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`

Start from `.env.example` and never commit real secrets.
