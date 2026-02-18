# kaine-forge monorepo

Phase 1 foundation for a Turborepo + pnpm monorepo.

## Prerequisites

- Node.js >= 20
- pnpm >= 10
- Docker (for local PostgreSQL)
- Rust toolchain (for Tauri desktop app)

## Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

Desktop app now uses Tauri v2 and loads the web app at `http://localhost:3000` in development.

## One-command bootstrap

```bash
pnpm initialize
```

`initialize` performs dependency reinstall, build, db generation/push/seed, then starts dev tasks.

## Turborepo notes

- Uses Turborepo `tasks` with per-task `description` metadata.
- Worktree use is supported and recommended for parallel branches.
- Remote cache is optional; run `pnpm dlx turbo login` and `pnpm dlx turbo link` when needed.
