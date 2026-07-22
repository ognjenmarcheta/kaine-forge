# Release Checklist

Use this checklist before merging a release PR or cutting a manual release from the template.

## 1. AI And Generated Files

- [ ] `pnpm ai:install`
- [ ] `pnpm ai:doctor`
- [ ] `pnpm generate` if GraphQL schema or operations changed
- [ ] Confirm tracked shared AI files (`AGENTS.md`, `CLAUDE.md`, `.serena/`) are intentionally updated or unchanged

## 2. Quality Gates

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm coverage`
- [ ] `pnpm build:core`
- [ ] `pnpm test:e2e`

## 3. Workspace-Specific Gates

- [ ] `pnpm --filter @repo/api test`
- [ ] `pnpm --filter @repo/web test`
- [ ] `pnpm --filter @repo/mobile typecheck`
- [ ] `pnpm --filter @repo/mobile-ui typecheck`
- [ ] `pnpm --filter @repo/desktop check` when desktop code changed

## 4. Database and Runtime

- [ ] Confirm migration state and whether `pnpm db:generate` is needed
- [ ] Validate `pnpm db:migrate` for migration-based deployments
- [ ] Confirm `API_RUN_MIGRATIONS` default is appropriate for the target environment
- [ ] Confirm `API_CORS_ORIGINS` matches deployment origins. It also feeds better-auth's `trustedOrigins`: any browser web origin missing from it fails sign-in with `403 INVALID_ORIGIN`, not a CORS error.
- [ ] Confirm Postgres SSL settings in `DATABASE_URL`
- [ ] Smoke test API startup and database connectivity

## 5. Docker

- [ ] Build API image: `docker build -f Dockerfile.api -t kaine-forge-api .`
- [ ] Build web image: `docker build -f Dockerfile.web -t kaine-forge-web .`
- [ ] Smoke test web nginx proxying for `/api` and `/graphql` when Docker is available

## 6. Selective App Release Branches

- [ ] Prefer the automated path: the Release workflow on `main` runs `pnpm release:apps` after quality gates (no-op when no deployable apps are affected).
- [ ] Manual override still works: `pnpm release:apps --dry-run` then `pnpm release:apps` from synced `main` if automation was skipped or a branch needs repair.
- [ ] Use `pnpm release:apps --apps all` only when intentionally initializing or republishing every deployable app branch
- [ ] Confirm only the expected `release/<app>` branches were updated

## 7. Changesets and Release Metadata

- [ ] Source changes in `apps/**`, `packages/**`, or `tooling/**` include `.changeset/*.md`
- [ ] Non-releasable source changes use `release:skip-changeset`
- [ ] `pnpm release:status`
- [ ] Review generated changelog/version output before merging a version PR

## 8. Security Review

- [ ] No secrets, tokens, `.env` files, local assistant state, or Serena cache files are tracked
- [ ] `.ai/mcp.json` contains placeholders only
- [ ] `.ai.local/`, local installed skill directories, and per-agent MCP configs are not tracked
- [ ] Auth/session changes preserve cookie-first behavior and bearer-token fallback safety
- [ ] GraphQL changes preserve auth, organization scoping, and validation
- [ ] Storage changes preserve least-privilege S3-compatible defaults

## 9. Release Automation

- [ ] `.github/workflows/ci-pr.yml` passed
- [ ] `.github/workflows/security.yml` passed or known findings are triaged
- [ ] `.github/workflows/release.yml` passed on `main`
- [ ] Version PR was created or updated by Changesets
- [ ] Tags and GitHub Releases exist after version PR merge
