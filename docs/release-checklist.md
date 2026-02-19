# Release Checklist

## 1. Pre-release validation

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm check`
- [ ] `pnpm coverage`
- [ ] `pnpm build:core`
- [ ] `pnpm test:e2e`
- [ ] `pnpm --filter @repo/desktop check`
- [ ] `pnpm --filter @repo/mobile check`

## 2. Changesets and versioning

- [ ] Confirm PR includes `.changeset/*.md` for releasable source changes
- [ ] Use label `release:skip-changeset` only for non-releasable source changes
- [ ] Validate pending release metadata (`pnpm release:status`)

## 3. Database and schema

- [ ] Confirm migration state (`pnpm db:generate`, `pnpm db:migrate` as needed)
- [ ] Validate GraphQL schema/codegen consistency (`pnpm generate`)

## 4. Runtime smoke checks

- [ ] API starts and health query returns `ok`
- [ ] API rejects overly deep GraphQL query (`API_GRAPHQL_MAX_DEPTH`)
- [ ] API CORS allowlist (`API_CORS_ORIGINS`) matches deployment origins
- [ ] Web auth + todos CRUD smoke test
- [ ] Desktop shell loads web app in dev
- [ ] Mobile app launches with `expo start -c`

## 5. Security and dependency checks

- [ ] Review `security.yml` workflow status (audit + secret scan)
- [ ] Verify no secrets or tokens are present in changed files

## 6. Release automation verification

- [ ] Confirm `.github/workflows/release.yml` passed on `main`
- [ ] Confirm release PR was created/updated by Changesets action
- [ ] After release PR merge, confirm tags were created and GitHub Release exists
