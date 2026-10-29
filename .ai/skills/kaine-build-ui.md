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
2. **Reuse before you build.** Look in `@repo/ui` (web, desktop, desk) or `@repo/mobile-ui` (mobile) for each part: `PageHeader`, `Table`, `StatCard`, `SegmentedControl`, `AvatarGroup`, `Kbd`, the charts (`LineChart`, `BarChart`, `DonutChart`, `RadialProgress`, `Sparkline`), `ProgressBar`, `ProportionBar`, `Gauge`, `FilterMenu`, `TopNav`, `EmptyState`, `QueryError`, `Skeleton`. Check their options in `DESIGN_SYSTEM.md` section 11.1 first: an icon button is `<Button spacing="icon">`, a white button is `appearance="raised"`, a stat tile with a trend is `StatCard` with `delta`, a control in a card header is `CardAction`, a filter chip is `FilterMenu`, and a card heading level is `CardTitle as`. Add a primitive only when two screens need it.
3. **Style with theme utilities only**: `text-ds-*`, `bg-ds-*`, `border-ds-*`, `p-ds-*`, `gap-ds-*`, `text-display`, `text-heading-*`, `text-body*`, `rounded-card`, `shadow-card`, `p-card`, and `duration-control ease-standard` for motion. Color a chart series by position; give it a `color` only when its meaning sets one, such as `"neutral"` for a comparison (COLOR-6). Tint a category tile, tag, or avatar with its chart tint, `bg-ds-bg-chart-N` with ink, `text-ds-text-subtle`, or `text-ds-text-chart-N` (also for an icon on the tint), never a chart color at an opacity (COLOR-7). Never a hex value, a default Tailwind palette or size class, or an arbitrary `[var(--ds-*)]` value. A utility in `className` wins over the component CSS, so adjust a shared component with a class instead of copying it.
4. **Cover every state**: loading, empty, error with retry, content, and disabled and pending actions (STATE-1, FORM-4).
5. **Translate every string** in `packages/translation` (en, de, sr) and pass text to components as props (COPY-1).
6. **Check** with `pnpm ui:check`, then look at the screen in light and dark, at 375px and full width, and with the keyboard only. Use `docs/ui/quality-checklist.md`.

## Reference-image mode

Use this mode when the request gives a screenshot, a mockup, or a brand book to recreate. The goal is a 1:1 match wherever the MUST rules allow it. Work in this order; do not start with code.

1. **Frame the reference.** Find the app's rectangle in the image. Set the screen frame (`width`, `height`) to the app's own size. When the image has a backdrop, a browser window, or a device around the app, set `referenceCrop` to that rectangle in image pixels (the lab's "Align reference" panel finds it).
2. **Write the visual spec** in the notes file before any code. Measure from the enlarged reference (click it in the compare view); do not guess.
   - **Theme axes:** brand and accent colors, neutral tint and temperature, how dark the dark mode is, heading and body fonts by kind (geometric sans, humanist sans, serif, mono), the largest figure or title size, corner radii, density, and depth (shadows or borders).
   - **Layout:** the column grid, gutters, outer padding, and each region's size in frame pixels.
   - **Components:** radius, padding, border, shadow, type step, and icon size of each repeated part.
   - **Charts, layer by layer from back to front:** grid and tracks, highlight regions (bands, capsules), series (stroke width, dash pattern, line cap, fill or gradient), markers and annotations, then the HTML layer (tooltips, pinned labels, legends) and the axis label spacing.
   - **Interaction:** what each chart shows on hover, focus, and tap, and what a click pins; what each control switches; and which changes move (DATA-5, DATA-6). A reference is a still image, so decide the behavior a real product would have.
3. **Make the look a theme**, not one-off values: in the UI lab, a lab theme with `createTheme` (lab themes never ship); in a product, follow `kaine-create-theme`. Keep the reference hex wherever its contrast pairs pass; set a reference's pastel tiles and tags as the chart tints (`background-chart-N`), which follow the chart colors when you leave them out. `type` sets single steps, such as a larger `display`, and `color.darkSurface` the dark page (`docs/ui/create-a-theme.md`).
4. **Rebuild the structure** with the shared components under that theme, with clearly fixed, typed fixture data that agrees with itself. Use the component options first: `DESIGN_SYSTEM.md` §11.1 lists them for `StatCard`, `TopNav`, `FilterMenu`, `Badge`, `Avatar`, `Card`, `NavUser`, `PageHeader`, `Sidebar`, `Table`, `SearchTrigger`, `Gauge`, `RadialProgress`, `ProportionBar`, and `ProgressBar`, so restyle a part through its `data-slot` only for what no option covers. Then the chart options (`dots`, `annotation`, `track`, `orientation`, `highlightColor`). When a mark has no option (stems, hatching, a capsule highlight, a band between two series, segmented arcs, a pinned tooltip), build the chart from the plot primitives in `@repo/ui`: `Plot` with `PlotGrid`, `PlotStems`, `PlotLine`, `PlotArea`, `PlotBand`, `PlotBars`, `PlotHighlight`, `PlotDots`, `PlotArcs`, `PlotAxis`, and the HTML `PlotTooltip`, `PlotAnchor`, and `PlotLegend`; §11.2 lists their options, such as horizontal and stacked bars, slice offsets and labels, and tooltip sides. A custom mark moves and rings like the built-in ones with `usePlotTween` and `PLOT_RING`. d3 scales do the math, SVG draws the marks back to front, and HTML draws the text. The lab's `#/charts` page shows each one. Keep the data in typed props, apart from the drawing. Wire every control to the data and make every chart interactive (DATA-5, DATA-6): the chart components and `Plot` give hover, focus, tap, pinning, and smooth data changes; do not hand-build them. Replace logos and photos with neutral placeholders, and never copy a third-party logo or name; for an interactive 3D view, follow `kaine-build-3d`.
5. **Apply the precedence rule**: the MUST rules win, then the reference's look, then the template defaults. List every forced change as a deviation: rule ID, what changed, why.
6. **Verify in a loop.** Run `pnpm lab:diff <id>` for the share of pixels that still differ (record it before your first change, so you can show the gain) and read `shots/<id>.diffmap.png`, where the differing pixels are red. `pnpm lab:shots <id>` adds the side-by-side and the difference view. Check five things: proportion and spacing, geometry and strokes, color, type and alignment, and the position of overlays. Fix the largest difference, shoot again, and repeat until every remaining difference is a listed deviation or a reported template gap. Then check the behavior in a browser: hover, focus, and tap each chart (its value shows and its mark highlights), switch each control (the numbers change and the marks move smoothly), walk the screen by keyboard, and repeat with reduced motion (changes snap). A screen that only looks right is not done.

## Gotchas

- With a `DropdownMenu` or `FilterMenu` open, axe reports `aria-hidden-focus`. The menu is modal: it hides the page from assistive technology and traps focus, so nothing hidden can take focus. This is expected; run axe with menus closed. A non-modal default was tried and broke menus in the sidebar.
- `CommandMenu` closes and returns focus before it runs the chosen command, and a dialog opened from a menu item returns focus to the menu's trigger. Open the dialog straight from `onSelect`; no timer is needed.
- Edits in any lab screen reload every open lab page. Check behavior on a private lab server with hot reload off, and rerun `lab:diff` once when a number jumps.

## Report

List the components used, any new component, the strings added, the checks run with their results, and the deviations with rule IDs.
