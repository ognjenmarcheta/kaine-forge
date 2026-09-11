# Day-one Agent-Assisted Contribution

This ramp is for engineers and non-engineers contributing with a coding agent when they do not yet hold the repo in their head. Encoded infrastructure — not chat memory — is the source of truth.

## 1. Install assistant files

For first-time local app setup, run `pnpm env:ensure`, set `ALLOW_LOCAL_DB_PUSH=true` in `.env`, then use `pnpm quick-setup`. Keep the opt-in off for shared databases.

```bash
pnpm ai:install
# optional: target a harness explicitly
# pnpm ai:install --agent claude
# pnpm ai:install --agent grok
# or full bootstrap: pnpm quick-setup (needs Docker services)
```

## 2. Health check

```bash
pnpm ai:doctor
```

Fix lint errors on canonical `.ai/` sources before coding. Drift warnings: re-run `pnpm ai:install`.

## 3. Read order (minimum)

1. `CONTEXT.md` — domain vocabulary **and** which features are mobile-supported vs web-first (Template platform surfaces)
2. `REVIEW.md` — what reviews will enforce
3. `MONOREPO_GUIDE.md` — architecture and package rules (including §19 feature ladder: API + web by default)
4. `DESIGN_SYSTEM.md` — only if the change touches UI

Optional: `docs/adr/` for decisions in the area you touch; `docs/agents/domain.md` for how agents consume domain docs.

Do not invent mobile parity for notes/assistant unless the task explicitly requires it.

## 4. Prefer skills over freeform

| Job                       | Skill                                                |
| ------------------------- | ---------------------------------------------------- |
| Tests                     | `kaine-test`                                         |
| Review                    | `kaine-review`                                       |
| PR                        | `kaine-open-pr`                                      |
| Encode a repeated failure | `kaine-encode-knowledge`                             |
| Sync AI files             | `kaine-sync-docs`                                    |
| Rebase / CI / release     | `kaine-rebase`, `kaine-fix-ci`, `kaine-release-apps` |

Product-specific skills: see `docs/agents/skill-authoring.md`.

## 5. Validation tiers

| Change type                   | Minimum checks                                                           |
| ----------------------------- | ------------------------------------------------------------------------ |
| Docs / `.ai/` only            | `pnpm ai:doctor`, `pnpm format:check`                                    |
| Package/app code, iterating   | `pnpm check:affected` (skips `boundaries` and `knip` — both whole-graph) |
| Package/app code, before a PR | `pnpm check`; `pnpm build:core` if API/web runtime                       |
| User-visible web/API flows    | add `pnpm test:e2e` when appropriate                                     |

## 6. Poke the running stack

Tests prove shape; this proves data. Bring the stack up, then sign in and run a
real query.

```bash
pnpm quick-setup   # docker compose up -d --wait && pnpm initialize
```

The seed identity lives in `packages/db/src/seed/users.seed.ts` and is created
by `pnpm db:seed`:

- email `test@test.test`
- password `ChangeMe123!`

These are **local fixtures only**. Never seed them into a shared or deployed
environment.

The API listens on `4000` and the web dev server on `3000`. better-auth returns
its token in the `set-auth-token` response header, so one sign-in gives you a
bearer token for GraphQL:

```bash
TOKEN=$(curl -sS -D - -o /dev/null   -X POST http://localhost:4000/api/auth/sign-in/email   -H 'content-type: application/json'   -d '{"email":"test@test.test","password":"ChangeMe123!"}'   | tr -d '\r' | awk -F': ' '/^set-auth-token:/ {print $2}')

curl -sS -X POST http://localhost:4000/graphql   -H 'content-type: application/json'   -H "authorization: Bearer $TOKEN"   -d '{"query":"{ notes { id title } }"}'
```

GraphiQL is served at `http://localhost:4000/graphql` in a browser. It carries
no session of its own, so either sign in at `http://localhost:3000` first or
paste the bearer header into its Headers tab.

To prove organization scoping without any of this running, use `pnpm smoke` —
it executes the two-organization tenancy proof in process.

## 7. When review bounces for "how we do things"

Do not only re-prompt. Run **`kaine-encode-knowledge`** so the rule becomes REVIEW/skill/test/CONTEXT for the next contributor.

## 8. What this ramp is not

Encoded context multiplies agents and people; it does not remove the need for judgment, security care, or running the checks above.

## Local database and release commands

Use `pnpm db:prepare:local` for local setup and `pnpm db:push:local` for local schema changes, with explicit `ALLOW_LOCAL_DB_PUSH=true` opt-in. Shared databases use reviewed migrations. See [local database rules](../../MONOREPO_GUIDE.md#22-local-database-and-release-commands).

The Release workflow updates deployment branches. Manual `pnpm release:apps` commands, including dry-runs, are human-only.
