---
name: kaine-audit-ui
description: Audit a screen, a UI diff, or a recreated screenshot against the UI guidelines and WCAG 2.2, and report findings with rule IDs; in reference mode, also score how closely a recreation matches its image.
argument-hint: route, component, diff, or recreation plus its reference image
---

# Audit UI

## Goal and non-goals

Find what breaks the UI rules, with evidence, and rank it. Do not fix while auditing unless asked; do not report taste as a finding. Every finding names a rule ID from `docs/ui/guidelines.md`.

## Steps

1. **Run the gates**: `pnpm ui:check`. Copy each failure as a finding.
2. **Look in four views**: light and dark, at 375px and at full width. Use Playwright against `pnpm dev:web` (or `pnpm lab` for components) and prefer accessibility snapshots to screenshots.
3. **Run axe** in both modes on the page; report serious and critical violations.
4. **Walk the keyboard path**: Tab through the page, open and close each overlay, and use the arrow keys in composite widgets.
5. **Check the states**: loading, empty, error, and content; a failed write; a pending submit.
6. **Read against the checklist** in `docs/ui/quality-checklist.md`.

## Reference mode

For a recreation of a screenshot, also score each dimension from 0 to 2 (0 missing, 1 close, 2 matches):

| Dimension  | Compare                                    |
| ---------- | ------------------------------------------ |
| Structure  | regions, grid, and reading order           |
| Palette    | brand, accent, neutrals, status colors     |
| Type       | font kind, scale, weight, numerals         |
| Shape      | corner radii of controls, cards, and chips |
| Density    | spacing and control heights                |
| Depth      | shadows, borders, and surface layers       |
| Components | the same kinds of parts in the same places |

A deviation that a MUST rule forced, listed with its rule ID, does not lower the score.

## Report

Findings first, most severe first: `<rule ID> <severity> <where>: <what fails>. <fix>.` Severities: blocker (a MUST rule), major (a default rule with user impact), minor. Then the scores in reference mode, then the commands run with their results.
