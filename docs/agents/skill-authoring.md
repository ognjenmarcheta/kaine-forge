# Skill Authoring

How to add reusable agent workflows for this repo.

## Canonical location

Team and template skills live at:

```text
.ai/skills/<name>.md
```

`.ai/` is the source of truth. Run `pnpm ai:install` after edits so generated assistant outputs stay aligned. Do not edit installed agent skill copies as the long-term home.

## The `kaine-` prefix is required under `.ai/skills/`

**Files under `.ai/skills/` must use the `kaine-` prefix** (for example `kaine-open-pr.md`). This is enforced by `discoverSkills` / `parseSkillFile` (`KAINE_PREFIX`). Non-prefixed skill files in that directory fail AI setup lint.

- Template-wide and product workflows that ship with the monorepo still use `kaine-*` under `.ai/skills/`.
- Product-local or personal skills that cannot be `kaine-` prefixed go in the agent’s local skill directory (for example Claude/Codex personal skills), **not** in `.ai/skills/`.
- To customize a team skill without fighting the installer: copy it to a non-prefixed name in your local agent skill dir and edit the copy. The installer only manages `kaine-*` skills and leaves personal copies alone.

## Frontmatter pattern

Mirror an existing skill (for example `.ai/skills/kaine-test.md`):

```markdown
---
name: kaine-example
description: One-line when-to-use description for skill discovery.
argument-hint: short hint for arguments
---

# Example Workflow

Use this skill when …

## Steps

1. …
```

- `name` must match the file stem and use the `kaine-` prefix.
- `description` should say when the skill applies (discovery surface).
- `argument-hint` is optional but preferred for skills that take a path, ticket, or failure mode.
- Keep the body procedural and short: goals, commands, done criteria.

## After you add a skill

1. List it in the skill list in `.ai/guide.md` (Generated / AI Skills sections stay consistent after install).
2. `pnpm ai:install`
3. `pnpm ai:doctor` — must be clean for the new skill (frontmatter, prefix, guide list).

## Prefer the encoding ladder before a new skill

Not every repeated instruction needs a skill. Prefer **`kaine-encode-knowledge`** to decide:

1. Machine check (lint / type / existing test / CI)
2. New focused test
3. `REVIEW.md` checklist item (edit `.ai/review.md`, then reinstall)
4. Skill or guide rule
5. `CONTEXT.md` / ADR

Add a skill when the work is a **multi-step workflow** people re-run (test plan, PR open, rebase, encode loop). Prefer REVIEW or tests for single rules that should gate every change.

## Related

- Day-one ramp: `docs/agents/day-one.md`
- Domain docs consumption: `docs/agents/domain.md`
- Shared review contract: `REVIEW.md` (canonical `.ai/review.md`)
