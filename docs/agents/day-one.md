# Day-one Agent-Assisted Contribution

This ramp is for engineers and non-engineers contributing with a coding agent when they do not yet hold the repo in their head. Encoded infrastructure — not chat memory — is the source of truth.

## 1. Install assistant files

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

| Change type                | Minimum checks                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Docs / `.ai/` only         | `pnpm ai:doctor`, `pnpm format:check`                                                      |
| Package/app code           | `pnpm check` (or focused workspace test + typecheck); `pnpm build:core` if API/web runtime |
| User-visible web/API flows | add `pnpm test:e2e` when appropriate                                                       |

## 6. When review bounces for "how we do things"

Do not only re-prompt. Run **`kaine-encode-knowledge`** so the rule becomes REVIEW/skill/test/CONTEXT for the next contributor.

## 7. What this ramp is not

Encoded context multiplies agents and people; it does not remove the need for judgment, security care, or running the checks above.
