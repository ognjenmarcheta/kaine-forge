---
name: kaine-encode-knowledge
description: Promote a repeated review rejection or agent mistake into durable infrastructure (lint, test, REVIEW, skill, CONTEXT, or docs) so the class of issue stops being one-off busywork.
argument-hint: failure mode, PR feedback, or recurring mistake
---

# Encode Domain Knowledge

Use this skill when:

- Code review rejected a change for a **domain or template** reason
- An agent fixed the same class of issue more than once
- A contributor had to learn something from a human not in REVIEW/CONTEXT/skills/tests

Do not use for one-off product bugs with no reuse.

## Goal

Ladder (prefer stronger automation when honest):

1. Machine check (existing ESLint/type/test/CI)
2. New focused test
3. REVIEW.md checklist item (edit `.ai/review.md`, then pnpm ai:install)
4. Skill or guide rule
5. CONTEXT.md / ADR
6. Serena memory only for stable cross-session facts

## Workflow

1. State failure mode in one sentence
2. Classify on the ladder
3. Find canonical home (never edit generated outputs)
4. Implement smallest encoding
5. When .ai/ changed: pnpm ai:install && pnpm ai:doctor
6. Point original fix PR at the encoding
7. If residual large gap only: line in docs/agents/automation-gap-audit.md

## Output

End with: failure mode, chosen rung, files changed, commands/results, residual audit line Y/N
