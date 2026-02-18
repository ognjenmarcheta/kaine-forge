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

Required CI checks are defined in `.github/workflows/ci-pr.yml`.

## Coding standards

- TypeScript strict mode is expected.
- Avoid `any` unless unavoidable.
- No user-facing hardcoded strings where i18n keys are expected.
- Keep feature modules aligned with naming conventions:
  - `.type.ts`, `.util.ts`, `.adapter.ts`, `.route.tsx`, `.definition.ts`, etc.
