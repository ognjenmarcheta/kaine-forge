---
name: kaine-motion-review
description: Act as a motion designer for a UI plan, issue, or diff — specify or review each animation against the motion contract, the MOTION rules, and the theme motion tokens, and name the test that proves it. Not for building the animation (kaine-build-ui) or a full UI audit (kaine-audit-ui).
argument-hint: issue number, plan, diff, or component path
---

# Motion Review Workflow

Use this skill to specify motion for a planned change, or to review motion in a diff.

## Goal and non-goals

- Goal: one spec row for each moving element, every value from a token, and a named test for each row.
- Do not add an animation framework. Web motion is CSS; native motion is Reanimated (the "Motion contract" in `DESIGN_SYSTEM.md` §7).
- Do not invent durations or curves. Use the tokens, or report the missing token as a finding.
- Do not write the animation code. `kaine-build-ui` owns building.

## Read first

- `DESIGN_SYSTEM.md` §7, the "Motion contract" subsection.
- `docs/ui/guidelines.md`, rules MOTION-1 to MOTION-4.
- The motion tokens in `packages/theme/src/theme.scale.ts`: the durations `--ds-motion-control`, `--ds-motion-overlay` and `--ds-motion-drawer` (web utilities `duration-control`, `duration-overlay`, `duration-drawer`, `ease-standard`), `--ds-motion-easing`, `--ds-motion-distance-dialog`, `--ds-motion-distance-menu`, and `--ds-motion-press-scale`.
- `apps/e2e/tests/web-motion.e2e.ts` for how the repo proves motion.

## Doctrine

- Motion explains a change. Remove motion that explains nothing (MOTION-1).
- Content never waits for an animation. The user can act before the motion ends.
- Animate only `transform` and `opacity` (MOTION-4). Name the property; never use `transition: all` (MOTION-2).
- No overshoot and no bounce.
- Reduced motion is a MUST (MOTION-3). On the web, follow the reduced-motion rules in `packages/ui/src/styles/globals.css`. On native, use `useReducedMotion` from `@repo/mobile-ui`.
- Do not animate message streams, list staggering, or route entry. Never delay navigation.
- An interrupted transition reverses from its current geometry.

## Steps

1. **List every element that moves** in the plan or diff, including the exit of each one.
2. **Write one spec row per element:**
   - purpose: what change it explains
   - trigger: the user action or state change that starts it
   - property: `transform` or `opacity`
   - tokens: duration, easing, and distance
   - reduced motion: what happens instead
   - interruption: what happens when the trigger reverses mid-animation
   - exit: how it leaves
3. **Check each row** against the doctrine and the rule IDs. Report each gap as a finding.
4. **Name the proof.** For each row, name the test: a midpoint check that pauses the animation and reads geometry, in the style of the `midpoint()` helper in `web-motion.e2e.ts`, plus a reduced-motion case.

## Report

- The spec table, one row per element.
- Findings, each with a rule ID and, where there is one, a `path:line`.
- The tests to add or extend.

## Headless runs (Agent Desk)

When the prompt supplies a result schema, fill the schema. Do not ask the user a question. Record each unknown as a finding, and state the default you chose. Put the plain-language ending in the schema's plain-language field. Do not print a banner or add any text outside the schema.
