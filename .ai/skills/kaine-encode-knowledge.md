---
name: kaine-encode-knowledge
description: Assess repeated workflows, corrections, or review failures; propose an existing skill improvement or a new reusable procedure, and encode authorized lessons in rules, tests, skills, or docs.
argument-hint: recurring workflow, failure mode, or PR feedback
---

# Encode Domain Knowledge

Use this skill when:

- Code review rejected a change for a **domain or template** reason
- An agent fixed the same class of issue more than once
- A contributor had to learn something from a human not in REVIEW/CONTEXT/skills/tests
- A successful multi-step workflow or correction repeats, or the user reports recurring work

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

1. State the repeated workflow or failure mode in one sentence.
2. For a recurring-work proposal, cite two concrete occurrences visible in this conversation or relevant existing issues, PRs, or docs. An explicit user report of recurring work also qualifies. Repeated retries within one debugging attempt do not establish a reusable workflow. Use available evidence only; do not harvest conversations, create issues automatically, or add a shared recurrence ledger.
3. Check existing skill names and descriptions first, then read plausible matches. Prefer extending the skill that already owns the workflow. If it already covers the procedure, use it without proposing a redundant addition.
4. Classify on the ladder. Prefer a rule, test, or lint check for a single invariant. Propose a new `kaine-*` skill only for a distinct, reusable procedure.
5. Keep the proposal concise: evidence, proposed name or existing skill, trigger, reusable steps, and expected benefit. Continue the requested task. Wait for user authorization before creating or expanding the proposed skill; explicit authorization already given for that change satisfies this step. Do not repeat a declined suggestion without new evidence available in context.
6. For authorized changes, find the canonical home and implement the smallest encoding. Never edit generated outputs.
7. When `.ai/` changes, run `pnpm ai:install` and `pnpm ai:doctor`.
8. Point the original work PR at the encoding when applicable.
9. For an authorized fix with a residual large automation gap only, follow the existing `docs/agents/automation-gap-audit.md` process. Do not use it as a log of recurring-work suggestions.

## Output

For a proposal, report the evidence, name, trigger, reusable steps, and benefit. State that implementation awaits authorization and continue the primary task.

For an authorized implementation, report the workflow or failure mode, chosen rung, files changed, commands/results, and whether a residual audit line was needed. Generation checks prove consistent files, not live agent behavior.
