# Contributing

## Branching and commits

- Work on feature/fix branches from `main`.
- Keep commits focused and reviewable.
- Use conventional-style commit messages where possible:
  - `feat(scope): ...`
  - `fix(scope): ...`
  - `chore(scope): ...`
  - `docs(scope): ...`

## Local quality gates

Run before opening a PR:

```bash
pnpm check
pnpm build:core
pnpm test:e2e
```

For workspace-focused work:

```bash
pnpm --filter <workspace> check
```

## Development setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:ensure
pnpm db:push
pnpm db:seed
```

Then:

```bash
pnpm dev
```

## Pull requests

- Link relevant issue/task.
- Describe behavior change and risk.
- Include test coverage notes.
- Keep PRs small enough for quick review.
- For source changes (`apps/**`, `packages/**`, `tooling/**`), add release metadata:

```bash
pnpm changeset
```

- If a source change is intentionally non-releasable, add PR label `release:skip-changeset`.

Required CI checks are defined in `.github/workflows/ci-pr.yml`.

## E2E and Accessibility

- Playwright tests live in `apps/e2e`.
- `pnpm test:e2e` covers sign-in + todo lifecycle and baseline axe checks.
- On CI failures, inspect uploaded artifacts (`playwright-report`, `test-results`).

## Release flow

- Check pending release metadata:

```bash
pnpm release:status
```

- Apply version/changelog changes locally (for maintainers):

```bash
pnpm release:version
```

- `main` merges trigger `.github/workflows/release.yml`, which runs quality gates and handles
  Changesets-based version/tag/release automation.

## Coding standards

- TypeScript strict mode is expected.
- Avoid `any` unless unavoidable.
- No user-facing hardcoded strings where i18n keys are expected.
- `apps/web` and `apps/mobile` enforce no JSX string literals and translated accessibility/placeholder/title props.
- Keep feature modules aligned with naming conventions:
  - `.type.ts`, `.util.ts`, `.adapter.ts`, `.route.tsx`, `.definition.ts`, etc.
