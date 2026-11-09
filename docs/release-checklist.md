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
- [ ] Confirm `API_CORS_ORIGINS` is set and matches deployment origins (production boot fails if empty). It also feeds better-auth's `trustedOrigins`: any browser web origin missing from it fails sign-in with `403 INVALID_ORIGIN`, not a CORS error.
- [ ] Confirm Postgres SSL settings in `DATABASE_URL`
- [ ] Smoke test API startup and database connectivity

## 5. Docker

- [ ] Prefer CI: the `docker-images` job builds `Dockerfile.api` / `Dockerfile.web` on pull requests when relevant paths change. On `main`, the `docker-cache.yml` workflow builds both images to seed the layer cache.
- [ ] Local optional: `docker build -f Dockerfile.api -t kaine-forge-api .`
- [ ] Local optional: `docker build -f Dockerfile.web -t kaine-forge-web .`
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
- [ ] Do not push to `changeset-release/main` or use "Update branch" on the version PR. The Release workflow rewrites that branch on every push to `main`; a hand update while Release runs fails its changesets step with "Reference does not exist".
- [ ] Confirm that the required checks ran on the version PR. Without `RELEASE_PR_TOKEN`, the Release workflow opens and updates the PR with the job token, so `github-actions[bot]` is its author. GitHub holds the `pull_request` runs of a PR from that bot as `action_required` until a user with write access approves them. The `fork_pr_contributor_approval` policy in `.github/repo-setup.json` does not cause this hold, because it applies only to pull requests from forks. The owner chooses one of these options:
  - Approve the held runs on the PR each time that the Release workflow updates it. This needs no setup.
  - Set repository secret `RELEASE_PR_TOKEN` (fine-grained PAT: Contents rw, Pull requests rw). The token owner then authors the PR, and its runs start without approval. The PAT expires, so rotate it before its expiry date.
  - Give the changesets step a GitHub App installation token. The App then authors the PR, and the token does not depend on a personal account. This needs a workflow change that creates the token before the changesets step.

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
