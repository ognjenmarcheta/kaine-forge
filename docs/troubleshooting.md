# Troubleshooting

Common local setup and runtime failures for Kaine Forge. Prefer this guide before reinstalling the monorepo.

**Preflight:** `pnpm preflight` checks Node, pnpm, Docker, common ports, and `.env` before bootstrap spends minutes on install/build. Re-run with `pnpm preflight -- --with-db` after Compose is up to probe Postgres TCP. A missing Rust toolchain (`rustc`/`cargo`) is a warning, because only desktop/Tauri work needs it; pass `pnpm preflight -- --with-desktop` to make it a failure. (The script is not named `doctor` because `pnpm doctor` is a pnpm built-in that would run instead and report a false green.) AI scaffold drift is separate: `pnpm ai:doctor`.

## Database and Docker

### Native Postgres on port 5432 shadows Compose

**Symptom:** `pnpm db:push`, seed, or e2e hit unexpected data, auth users, or schemas; or migrations apply to the wrong database.

**Cause:** Host Postgres (or another container) already listens on `localhost:5432`. Docker Compose maps `postgres:17` to the same port, so clients using `DATABASE_URL=...@localhost:5432/...` may talk to the host instance instead of the Compose service.

**Fix:**

1. Stop the host Postgres (or move it off 5432), **or**
2. Change Compose host port (e.g. `"5433:5432"`) and set `DATABASE_URL` to that port.
3. Confirm which process owns 5432: `lsof -i :5432` (macOS/Linux).

Compose default is `5432:5432` with `POSTGRES_DB=monorepo_dev` (see `docker-compose.yml` and `.env.example`).

### Docker daemon not running

**Symptom:** `docker compose up` fails with cannot connect to the Docker daemon.

**Fix:** Start Docker Desktop (or your engine), then:

```bash
docker compose up -d
pnpm db:ensure
pnpm db:push
pnpm db:seed
```

### MinIO ports 9000/9001 already in use

**Symptom:** Compose MinIO fails to bind, or storage uploads hit a different MinIO.

**Cause:** Another MinIO (or service) holds `9000`/`9001`.

**Fix:** Stop the other service or remap Compose ports and update storage env vars to match.

## Auth and CORS

### Sign-in fails with `403 INVALID_ORIGIN`

**Symptom:** Browser sign-in/sign-up fails with `INVALID_ORIGIN`; looks like an auth bug.

**Cause:** `API_CORS_ORIGINS` is **dual-purpose**: it feeds API CORS **and** better-auth `trustedOrigins`. A web origin missing from the list is rejected by better-auth even when GraphQL otherwise works.

**Fix:** List every browser origin exactly (scheme + host + port), e.g.:

```bash
API_CORS_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
```

For Playwright e2e, the web origin used in the browser (e.g. `http://127.0.0.1:3010`) must be trusted. See ADR 0008 and `MONOREPO_GUIDE.md` section 9 (Runtime and Environment Rules).

### Session cookie name

Cookie is **`kaine.session_token`** (`cookiePrefix: "kaine"`). The API also accepts `Authorization: Bearer <session-token>` for clients that cannot rely on cookies.

If you inspect cookies in DevTools and only look for a generic `session` name, you will miss the real cookie.

### Password hashes after forking migrations

**Symptom:** Existing users cannot log in after reordering or squashing migrations.

**Cause:** Migration order is load-bearing: migration `0003` backfills credential passwords into `accounts.password` before `0005` drops `users.password_hash`. Reordering or skipping can drop password material.

**Fix:** Apply migrations in published order on forks with existing data. Do not drop `0003` while keeping `0005`.

## GraphQL codegen and formatting

### `pnpm generate` leaves format:check failing

**Symptom:** After codegen, `pnpm format:check` fails on generated GraphQL client files.

**Fix:** Run `pnpm generate` (hooks run Prettier on written files when configured). If a generator path still fails format:

```bash
pnpm --filter @repo/web exec prettier --write "src/graphql/generated/**/*"
pnpm --filter @repo/mobile exec prettier --write "src/graphql/generated/**/*"
```

Commit generated outputs with the operation/schema change that produced them. Do not hand-edit generated files.

### Stale generated operations

**Symptom:** Type errors or runtime GraphQL field mismatches after schema changes.

**Fix:**

```bash
pnpm generate
pnpm typecheck
```

Root `pnpm generate` runs API `schema:generate` then client codegen in one step. CI fails if generated files drift from the commit.

## Desktop and Tauri

### `pnpm boundaries` / `pnpm check` fails after a desktop build

**Symptom:** `pnpm boundaries` (and so `pnpm check`) exits 1 with `failed to read file .../apps/desktop/src-tauri/target/.../tauri-codegen-assets/<hash>.js` after a desktop build (`tauri build` or `tauri dev`) that ran before the Cargo target directory moved out of the package.

**Cause:** `turbo boundaries` walks every `*.js` file under a workspace, gitignored or not. Tauri writes compressed codegen assets with a `.js` extension into the Cargo target directory; they are not valid UTF-8, so the walk fails on the first one. Cargo output now goes to the repo-root `.tauri-target/` (set by `apps/desktop/src-tauri/.cargo/config.toml`), which is outside every workspace, gitignored, and dockerignored.

**Fix:** Delete the old target directory, then re-run the gate:

```bash
rm -rf apps/desktop/src-tauri/target
pnpm boundaries
```

`pnpm --filter @repo/desktop run clean` removes the current `.tauri-target/`. `pnpm bootstrap` never compiles the desktop app: it runs `turbo run build --filter=!@repo/desktop`, so only `pnpm --filter @repo/desktop build` (or a full `pnpm build`) produces Cargo output.

## AI assistant scaffold

### `pnpm ai:doctor` reports drift or missing skills

**Symptom:** Stale `AGENTS.md` / `REVIEW.md` / local skill installs after pull.

**Fix:**

```bash
pnpm ai:install
pnpm ai:doctor
```

Edit only canonical sources under `.ai/`, never generated agent outputs by hand. See `docs/agents/day-one.md`.

## Ports reference (defaults)

| Service  | Default host port | Notes                          |
| -------- | ----------------- | ------------------------------ |
| Postgres | 5432              | Shadow risk with native PG     |
| API      | 4000              | `API_PORT` / `BETTER_AUTH_URL` |
| Web Vite | 3000 (dev)        | E2e may use 3010               |
| MinIO    | 9000 / 9001       | API + console                  |

## Still stuck

1. `pnpm ai:doctor` and `pnpm check` (narrow filters when possible).
2. Confirm `.env` from `.env.example` and that Compose services are healthy: `docker compose ps`.
3. Search ADRs under `docs/adr/` for auth, rate limiting, and mobile runtime decisions.
