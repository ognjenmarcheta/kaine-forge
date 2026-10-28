---
name: kaine-build-ui
description: Build or change a screen or component in the web, desktop, desk, or mobile UI, or recreate a screenshot or brand look, using the theme utilities, the shared components, and the UI guidelines.
argument-hint: screen, component, or reference image to build
---

# Build UI

## Goal and non-goals

Ship a screen that does its task, follows the active theme, and passes the UI rules in every theme and mode. Do not add one-off colors, sizes, or fonts; do not edit generated token files; do not change a theme as a side effect of building a screen (use `kaine-create-theme`).

## Read first

1. `docs/ui/README.md`, then `docs/ui/guidelines.md` (rules by ID and the precedence rule).
2. The active theme's `DESIGN.md` (`DESIGN.md` at the root for the default theme).
3. `CONTEXT.md` for the names of domain concepts on the screen.

## Steps

1. **Name the task.** Write one line: who uses the screen, to do what, how often. Pick the structure from it: table, list with dividers, split view, form, or dashboard (LAYOUT-1).
2. **Reuse before you build.** Look in `@repo/ui` (web, desktop, desk) or `@repo/mobile-ui` (mobile) for each part: `PageHeader`, `Table`, `StatCard`, `SegmentedControl`, `AvatarGroup`, `Kbd`, the charts (`LineChart`, `BarChart`, `DonutChart`, `RadialProgress`, `Sparkline`), `ProgressBar`, `ProportionBar`, `EmptyState`, `QueryError`, `Skeleton`. Add a primitive only when two screens need it.
3. **Style with theme utilities only**: `text-ds-*`, `bg-ds-*`, `border-ds-*`, `p-ds-*`, `gap-ds-*`, `text-display`, `text-heading-*`, `text-body*`, `rounded-card`, `shadow-card`, `p-card`, and `duration-control ease-standard` for motion. Color a chart series by position; give it a `color` only when its meaning sets one, such as `"neutral"` for a comparison (COLOR-6). Never a hex value, a default Tailwind palette or size class, or an arbitrary `[var(--ds-*)]` value.
4. **Cover every state**: loading, empty, error with retry, content, and disabled and pending actions (STATE-1, FORM-4).
5. **Translate every string** in `packages/translation` (en, de, sr) and pass text to components as props (COPY-1).
6. **Check** with `pnpm ui:check`, then look at the screen in light and dark, at 375px and full width, and with the keyboard only. Use `docs/ui/quality-checklist.md`.

## Reference-image mode

Use this mode when the request gives a screenshot, a mockup, or a brand book to recreate.

1. **Read the look into theme axes**: brand and accent colors, neutral tint and temperature, how dark the dark mode is, heading and body fonts (by kind: geometric sans, humanist sans, serif, mono), the size of the largest figure or title, corner radii, density, and depth (shadows or borders). Write them down before any code. `createTheme` takes `color.darkSurface` for the dark page and `type` for single type steps, such as a larger `display` (`docs/ui/create-a-theme.md`).
2. **Make the look a theme**, not one-off values: in the UI lab, add a lab theme with `createTheme` (lab themes never ship); in a product, follow `kaine-create-theme`.
3. **Rebuild the structure** with the shared components, under that theme. Use clearly fixed fixture data. Replace logos, photos, and 3D art with neutral placeholders; never copy a third-party logo.
4. **Apply the precedence rule**: the MUST rules win, then the reference's look, then the template defaults. List every forced change as a deviation: rule ID, what changed, why.
5. **Compare** the result beside the reference (`pnpm lab`, `/compare/<screen>`) and fix the largest differences in structure first, then palette, type, shape, density, and depth.

## Report

List the components used, any new component, the strings added, the checks run with their results, and the deviations with rule IDs.
