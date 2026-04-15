# Design System Alignment Audit

Date: 2026-02-21  
Mode: Strict spec conformance (`DESIGN_SYSTEM.md` treated as authoritative)

> Historical note: this audit records the state of the implementation on 2026-02-21. `DESIGN_SYSTEM.md` has since been refreshed for the template's current web/mobile split and should be treated as the live source of truth.

## Scope

- Design spec: `DESIGN_SYSTEM.md`
- Shared UI implementation: `packages/ui/src/styles/globals.css`, `packages/ui/src/components/**/*`, `packages/config/tailwind/preset.js`
- Web consumer implementation: `apps/web/src/styles.css`, `apps/web/src/providers/theme.provider.tsx`, feature UI usage

## Method

- Rule-by-rule comparison against enforceable statements in `DESIGN_SYSTEM.md`
- Static scans for raw visual values and non-token interaction states
- Manual review of core primitives and app-level styles

## Scorecard

| Category                                  | Status  | Notes                                                                                        |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| Theme mode wiring (light/dark/system)     | Pass    | `data-theme` runtime wiring is implemented (`apps/web/src/providers/theme.provider.tsx:20`). |
| Functional token usage in most components | Partial | Many components use `--ds-*`, but several areas bypass documented token semantics.           |
| Token set completeness vs spec tables     | Fail    | 27 explicitly documented tokens are missing from `globals.css`.                              |
| Interaction states tokenization           | Fail    | Hover/press states include `filter`, `color-mix`, and opacity-based state handling.          |
| Elevation/surface pairing                 | Fail    | At least one direct mismatch (`surface-raised` paired with `shadow-overlay`).                |
| Typography/spacing token discipline       | Fail    | Widespread raw `px` values and manual letter spacing in shared and app CSS.                  |
| Accessibility focus indicator baseline    | Pass    | Focus indicators are present in shared controls (`packages/ui/src/styles/globals.css:405`).  |
| Web app adherence to DS scale/breakpoints | Fail    | Custom breakpoints and many non-token dimensions in app stylesheet.                          |

## Findings (Highest Severity First)

### 1) Missing documented token contract (Critical)

`DESIGN_SYSTEM.md` token references define required tokens that do not exist in `packages/ui/src/styles/globals.css`.

Evidence:

- Spec expects pressed and additional state tokens (`DESIGN_SYSTEM.md:1605`, `DESIGN_SYSTEM.md:1626`, `DESIGN_SYSTEM.md:1634`, `DESIGN_SYSTEM.md:1662`, `DESIGN_SYSTEM.md:1701`, `DESIGN_SYSTEM.md:1712`).
- Missing from implementation include:
  - `--ds-blanket-selected`
  - `--ds-background-neutral-subtle-pressed`
  - `--ds-background-neutral-pressed`
  - `--ds-background-neutral-bold-hovered`
  - `--ds-background-neutral-bold-pressed`
  - `--ds-background-brand-bold-pressed`
  - `--ds-background-selected-hovered`
  - `--ds-background-selected-pressed`
  - `--ds-background-selected-bold-hovered`
  - `--ds-background-selected-bold-pressed`
  - `--ds-font-heading-display`
  - `--ds-font-heading-xxlarge`
  - `--ds-font-heading-xlarge`
  - `--ds-font-heading-large`
  - `--ds-font-heading-medium`
  - `--ds-font-heading-small`
  - `--ds-font-heading-xsmall`
  - `--ds-font-heading-xxsmall`
  - `--ds-font-body-large`
  - `--ds-font-body`
  - `--ds-font-body-small`
  - `--ds-font-body-xsmall`
  - `--ds-font-code`
  - `--ds-breakpoint-sm`
  - `--ds-breakpoint-md`
  - `--ds-breakpoint-lg`
  - `--ds-breakpoint-xl`

Impact:

- The documented token API cannot be consumed as specified.
- Consumers cannot reliably use spec-defined names for state/typography/breakpoint decisions.

### 2) Interaction state rules violated by ad hoc effects (Major)

Spec requires token-based states and forbids custom hover color hacks (`DESIGN_SYSTEM.md:534`).

Evidence:

- `filter: brightness(0.95)` on button hover: `packages/ui/src/styles/globals.css:419`
- `color-mix(...)` custom hover background: `packages/ui/src/styles/globals.css:430`
- opacity-driven disabled styling in interaction contexts: `packages/ui/src/styles/globals.css:400`, `packages/ui/src/styles/globals.css:722`

Impact:

- State behavior is not theme-contract driven.
- Visual consistency and theming predictability degrade.

### 3) Elevation pairing mismatch (Major)

Spec requires matching surface + shadow levels (`DESIGN_SYSTEM.md:858`).

Evidence:

- `background: var(--ds-surface-raised)` with `box-shadow: var(--ds-shadow-overlay)`:
  `packages/ui/src/styles/globals.css:691`

Impact:

- Elevation semantics become ambiguous.
- Components may look inconsistent across themes.

### 4) Sidebar styling bypasses DS semantic tokens (Major)

Spec mandates token-first semantics and discourages raw value usage in UI code (`DESIGN_SYSTEM.md:52`, `DESIGN_SYSTEM.md:76`).

Evidence:

- Raw HSL sidebar variables in token root:
  `packages/ui/src/styles/globals.css:230`, `packages/ui/src/styles/globals.css:366`
- Component-level HSL interpolation:
  `packages/ui/src/components/primitives/sidebar.tsx:456`

Impact:

- Sidebar visual language is partly detached from `--ds-*` semantic contract.
- Cross-theme consistency depends on special-case variables rather than DS foundations.

### 5) Typography and spacing drift from DS scale (Major)

Spec disallows manual letter-spacing and defines tokenized type/space scales (`DESIGN_SYSTEM.md:693`, `DESIGN_SYSTEM.md:613`, `DESIGN_SYSTEM.md:705`).

Evidence:

- Manual letter-spacing:
  - `packages/ui/src/styles/globals.css:563`
  - `apps/web/src/styles.css:2`
- Raw non-token font sizes and dimensions:
  - `packages/ui/src/styles/globals.css:561`
  - `packages/ui/src/styles/globals.css:600`
  - `packages/ui/src/styles/globals.css:671`
  - `apps/web/src/styles.css:23`
  - `apps/web/src/styles.css:92`

Impact:

- Typography and spacing rhythm diverges between components and app surfaces.
- Future token evolution cannot propagate cleanly.

### 6) Web app stylesheet uses custom breakpoint and many raw dimensions (Major)

Spec defines breakpoint tokens and documented pixel thresholds (`DESIGN_SYSTEM.md:787`).

Evidence:

- Custom media query cutoff `900px`: `apps/web/src/styles.css:148`
- Extensive raw spacing/sizing values throughout file:
  `apps/web/src/styles.css:6`, `apps/web/src/styles.css:11`, `apps/web/src/styles.css:50`, `apps/web/src/styles.css:91`

Impact:

- Web app layout behavior can diverge from shared DS-responsive conventions.

### 7) Surface-shadow mismatch in web cards (Major)

Spec requires consistent level pairing (`DESIGN_SYSTEM.md:858`).

Evidence:

- Default surface with raised shadow:
  `apps/web/src/styles.css:54`, `apps/web/src/styles.css:57`

Impact:

- Card hierarchy is not semantically encoded through DS elevation pairings.

## Positive Alignment

- Theme mode application and system theme syncing exist and are correctly wired:
  `apps/web/src/providers/theme.provider.tsx:25`, `apps/web/src/providers/theme.provider.tsx:46`
- Shared focus-visible styles are present for core controls:
  `packages/ui/src/styles/globals.css:405`
- Most shared primitives consume `--ds-*` tokens for base colors and borders.

## Quantitative Signals

- `apps/web/src/styles.css`: 28 raw `px` occurrences.
- `packages/ui/src/styles/globals.css`: 123 raw `px` occurrences.
- Shared UI globals include 2 `filter:` usages and 1 `color-mix(...)` usage.
- Document token references (`DESIGN_SYSTEM.md`) include 179 `--ds-*` tokens; UI globals define 135 unique `--ds-*` tokens.

## Prioritized Remediation Backlog

### Phase 1 (Fast, low-risk contract fixes)

1. Add missing documented tokens to `packages/ui/src/styles/globals.css` for both light/dark themes.
2. Extend `packages/config/tailwind/preset.js` mappings for newly added consumable tokens where needed.
3. Replace `filter`/`color-mix` hover behavior in `.ui-button*` with explicit state tokens.

### Phase 2 (Component semantics normalization)

1. Fix elevation mismatches:
   - `packages/ui/src/styles/globals.css:691`
   - `apps/web/src/styles.css:54`
2. Convert sidebar special variables to DS semantic token references (or formally document them as component tokens in DS).
3. Replace non-token typography and spacing literals in shared UI utility layer.

### Phase 3 (Web app conformance)

1. Refactor `apps/web/src/styles.css` from raw values to DS spacing/type/control scales.
2. Align media-query breakpoints with DS conventions.
3. Reduce local app style overrides where equivalent `@repo/ui` primitives already encode DS behavior.

## Enforcement Guardrails (Recommended)

1. Add CI checks that fail on new raw color values (`#`, `rgb`, `hsl`) in `packages/ui/src/components` and `apps/web/src`, except token declaration files.
2. Add CI checks for prohibited interaction patterns in shared UI layer (`filter:` and `color-mix(` outside token definitions).
3. Add a token-contract check script to validate that all tokens in section 12 tables are present in `globals.css`.
