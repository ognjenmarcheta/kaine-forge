# @repo/ui-lab

## 0.1.1

### Patch Changes

- Updated dependencies [6980f5e]
  - @repo/ui@2.0.1

## 0.1.0

### Minor Changes

- e64ae54: The plot primitives cover more chart designs without custom marks. All new options are opt-in, so current plots render as before.

  - `PlotBars` draws horizontal rows with `orientation="horizontal"`, and stacks segments when `y0` or `x0` reads a start per bar. A stack rings as one column or row.
  - `PlotLine` takes `extend`, which runs the line to the edges of the drawing area.
  - `PlotArcs` takes `stroke` (an edge or an even gap), `offset` (moves a slice out), and `label` (text on each slice).
  - `PlotAxis` takes `align="start"` for y labels, a `\n` in a label for a second line, and `highlight` for the active label.
  - `interaction.spans` picks parts of unequal size by the part under the pointer. `interaction.rest` sets what a pinned point shows at rest: `"highlight"` holds its tooltip until people use the plot, and `"none"` shows neither ring nor tooltip.
  - `PlotAnchor` and `PlotTooltip` take `side="above"`, `"below"`, and `"beside"`, which center, flip, and stay inside the plot, and `maxWidth`. A `PlotLegend` item's `fill` draws a tint or hatch swatch with an edge in its color.
  - Custom marks use `usePlotTween` to move on the motion tokens and `PLOT_RING` to draw the active ring.

  The UI lab's charts page shows each option.

- e64ae54: `@repo/ui` gains plot primitives for charts that a design draws its own way: `Plot`, with d3 scales, SVG marks (grid, stems, lines, areas, bands, bars with tracks, capsule highlights, dots, segmented arcs) and HTML overlays (tooltip, anchor, legend). A plot is interactive by default: hover, focus, or tap shows a mark's value, a click pins it, the arrow keys walk the points, and marks tween to new data on the motion tokens and snap under reduced motion. `Gauge` parts answer hover and keys, and the Recharts charts animate on the token durations.

  `@repo/ui-3d` is a new package for accessible 3D views. `Viewport3D` loads three.js lazily, mirrors a DOM control, turns and zooms by keys and buttons, respects reduced motion, renders on demand, and falls back when WebGL is missing. `useThemeColors` and `useThemeMaterials` color a scene from the theme tokens.

  The UI lab compares a screen with its reference side by side, with a slider, or as an overlay or a difference, enlarges the reference, aligns it with `referenceCrop`, lists screens on their own page, and saves a difference image in `pnpm lab:shots`.

- e64ae54: Themes are now data in the new `@repo/theme` package. Byte Forge stays the default with unchanged colors, and Moss is an example custom theme. `pnpm theme:build` writes the web tokens and utilities, the mobile tokens, the NativeWind preset tokens, and each theme's `DESIGN.md`. It fails when a theme misses WCAG 2.2 AA contrast or the 24px target size. `createTheme` derives a full theme from a brand color, a neutral tint, fonts, density, and depth. `pnpm ui:check` runs the accessibility and UI lint rules, and `pnpm lab` previews themes and components.

  Breaking changes:

  - `@repo/ui`: the web gets theme utilities (`bg-ds-surface-raised`, `p-ds-200`, `text-body`, `rounded-card`, `shadow-card`), and the default Tailwind palette, font sizes, radii, and shadows generate no CSS. Replace `text-sm` with `text-body`, `text-xs` with `text-body-sm`, and `bg-[var(--ds-*)]` with the matching utility.
  - `@repo/ui` and `@repo/config`: 127 unused tokens are removed, including the accent hues and the attention, severe, open, closed, and done families. `--ds-lineHeight-*` is renamed `--ds-line-height-*`, and the `--ds-base-*` tier is gone.
  - The root element now carries `data-color-mode="light|dark"`, and `data-theme` names the theme. The Tailwind `dark:` variant follows `data-color-mode`.
  - `@repo/mobile-ui`: `nativeThemeTokens` is keyed by theme name, and the `fontFamilies` export is removed. Wrap the app in `ThemeRoot` and read colors with `useThemeTokens()`.
  - `@repo/translation`: `navigation.theme*` and `desk.prefs.theme*` are now `navigation.appearance*` and `desk.prefs.appearance*`, and the label reads "Appearance".
  - `@repo/ui`: `AvatarGroup` requires an `aria-label`, and with `max` an `overflowLabel`.

  New components: `Table`, `SegmentedControl`, `Kbd`, `ProportionBar`, and the charts `LineChart`, `BarChart`, `DonutChart`, `RadialProgress`, and `Sparkline` in `@repo/ui`; `ProgressBar`, `DonutChart`, and `BarChart` in `@repo/mobile-ui`. Chart series take a fixed `color` (a chart slot, a role, or `"neutral"`), and the charts add dashed lines, reference lines, value labels, a highlighted bar, legend positions, and hidden axes.

  Shared components gain what designs kept rebuilding. `Button` has `appearance="outline"` and `spacing="icon"`. `CardTitle` takes `as`. `StatCard` takes any value node, an `icon`, a `delta` badge, a `description`, and an `action`. `Checkbox` draws the indeterminate state and has a 24px hit area. `Banner` has `emphasis="subtle"`, and it is a polite `status` unless `urgent`. `Table` scrolls by keyboard when it overflows and takes `scrollLabel`. `AppSidebar` holds its parts in one navigation landmark named by `label`. `CommandMenu` returns focus to where it opened. Web fields and selects are 40px high.

  The `@repo/ui` CSS now sits in cascade layers, so a utility in `className` wins over a component's own CSS. The new `ui/no-reset-default` lint rule reports Tailwind defaults that the theme removes, such as `rounded`, `text-sm`, and `bg-red-500`, and the motion tokens are used through `duration-*` and `ease-standard` instead of arbitrary values.

  A second round added `appearance="raised"` on `Button`, `FilterMenu`, `CardAction`, `TopNav`, `StatCard` part slots and a `visual` slot, `AvatarFallback` tones, `PageHeader size="display"`, `CopyButton labelSuffix`, chart dots, annotations, gradient areas, bar tracks, horizontal bars and highlight colors, a colored `RadialProgress`, and `Gauge`. A focus ring no longer fades in, a labelled sidebar group is a named group, a sidebar count describes its link, and the contrast check now covers role borders, chart colors, and raised fills on cards and sunken areas.

  Themes gain a `display` type step (`text-display`), per-step `type` changes and a `color.darkSurface` lightness in `createTheme`, and the motion utilities `duration-control`, `duration-overlay`, `duration-drawer`, and `ease-standard`. In dark mode, derived cards sit one step above the page and sunken areas one step below it, and the contrast check also measures text, charts, and role borders on cards and sunken areas. Field borders now reach 3:1 against the surface, and the email fallback link now reaches 4.5:1.

### Patch Changes

- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
  - @repo/theme@0.1.0
  - @repo/ui@2.0.0
