---
name: kaine-design-review
description: Act as the designer for a UI plan, issue, or diff before or during the build — rate the intended screen on seven design dimensions against the UI guidelines, say what a 10 looks like, and propose a few written directions inside the active theme. Not for auditing a built screen in a browser (kaine-audit-ui) or building UI (kaine-build-ui).
argument-hint: issue number, plan, diff, or screen path
---

# Design Review Workflow

Use this skill to review the design intent of a screen or component before or while it is built.

## Goal and non-goals

- Goal: a scored review of the intended design, with the gap to a 10 for each dimension and the fix that closes it.
- Do not audit a running screen. `kaine-audit-ui` owns browser checks, axe, and the four views.
- Do not write UI code. `kaine-build-ui` owns building.
- Do not generate images. Directions are written.
- Every judgment cites a rule ID from `docs/ui/guidelines.md` or a section of `DESIGN_SYSTEM.md`. A taste opinion with no rule is a `Consider:` at most.

## Read first

- `DESIGN.md` (default theme) or the active theme's `packages/theme/src/themes/<name>/DESIGN.md`.
- `DESIGN_SYSTEM.md`: §3.3 token naming, §11.1 composed page parts, §13 visual-taste rules.
- `docs/ui/guidelines.md`: the rule IDs and their precedence (MUST rules, then the requested look, then template defaults).

## Steps

1. **Name the screen and its job.** State who uses it and the one thing they must do there.
2. **Rate seven dimensions from 0 to 10.** For each, say what a 10 looks like for this screen, name the gap, and give the fix:
   - Information architecture: hierarchy, grouping, and the primary action (LAYOUT).
   - State coverage: loading, empty, error, success, and partial states (STATE).
   - Journey: what the user understands in the first 5 seconds, and can finish in the first 5 minutes.
   - Generic-look risk: the §13 taste rules; a screen that could belong to any product scores low.
   - Design-system fit: `--ds-*` tokens only, and `@repo/ui` components reused before new ones (COLOR, TYPE, SPACE).
   - Responsive and accessibility: narrow and wide layouts, focus order, target size, contrast (RESP, A11Y).
   - Open decisions: what the plan leaves undecided that the builder would have to guess.
3. **Directions (when asked, or when the score is below 7).** Write 2 or 3 directions that stay inside the active theme's tokens. Vary the layout and hierarchy, not the palette. Give each direction a one-line reason. For a new look, hand off to `kaine-create-theme` or the desk's screen job.
4. **Order the fixes.** Put MUST-rule gaps first, then the fixes that raise the lowest score.

## Report

- A score table: the dimension, the score, what a 10 looks like, and the fix.
- Findings, each with a rule ID and, where there is one, a `path:line`.
- The directions, if any, and the open decisions for the owner.

## Headless runs (Agent Desk)

When the prompt supplies a result schema, fill the schema. Do not ask the user a question. Record each open decision as a finding, and state the default you chose. Put the plain-language ending in the schema's plain-language field. Do not print a banner or add any text outside the schema.
