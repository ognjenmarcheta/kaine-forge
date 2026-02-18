# Release Checklist

## 1. Pre-release validation

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm check`
- [ ] `pnpm build:core`
- [ ] `pnpm --filter @repo/desktop check`
- [ ] `pnpm --filter @repo/mobile check`

## 2. Database and schema

- [ ] Confirm migration state (`pnpm db:generate`, `pnpm db:migrate` as needed)
- [ ] Validate GraphQL schema/codegen consistency (`pnpm generate`)

## 3. Runtime smoke checks

- [ ] API starts and health query returns `ok`
- [ ] Web auth + todos CRUD smoke test
- [ ] Desktop shell loads web app in dev
- [ ] Mobile app launches with `expo start -c`

## 4. Security and dependency checks

- [ ] Review `security.yml` workflow status (audit + secret scan)
- [ ] Verify no secrets or tokens are present in changed files

## 5. Release notes and versioning

- [ ] Summarize user-visible changes
- [ ] Document breaking changes (if any)
- [ ] Tag/branch according to release policy
