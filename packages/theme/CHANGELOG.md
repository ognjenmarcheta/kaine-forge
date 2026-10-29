# @repo/theme

## 0.1.0

### Minor Changes

- e64ae54: Each chart color has a tint and a text color, for category tiles, tags, and avatars.

  - Twelve color roles: `background-chart-1` to `background-chart-6`, a pale fill in each chart color's hue (`bg-ds-bg-chart-N`), and `text-chart-1` to `text-chart-6`, its text color (`text-ds-text-chart-N`). They reach web, mobile, and NativeWind like every role.
  - `createTheme` derives them from the final chart colors, so a theme that sets its own chart colors keeps its tints in step. A tint the theme sets wins, and its text color is derived against it. `createCategoryColors` derives them for a theme built by hand.
  - `contrastPairs` adds 36 pairs, which lab themes pass too: ink, `text-subtle`, and the text color on each tint, and each text color on the page, cards, and sunken areas. The chart color is not measured on its tint, so a theme can set a mid-tone pastel; an icon or a mark on a tint takes the text color.
  - `AvatarFallback`'s chart tones draw the tint with its text color, not the chart color at 20% with ink.
  - A `PlotFill` of `{ type: "tint", color: "chart-N" }` paints a mark in the tint, such as a bar that carries ink text. `RadialProgress`'s `fill` draws a chart slot's tint.

- e64ae54: The last small component options that designs had to restyle by hand.

  - `SidebarMenuButton` takes `variant="brand"`: the current link in brand text and icon on the neutral fill, with no start indicator.
  - `CardAction` takes `wrap={false}`, which keeps a short action, such as a period pill, on the title row in a narrow `@container/card`.
  - Every theme now passes brand text on the neutral fill (`text-brand` on `background-neutral`, 4.5:1), the pair the brand variant draws.

- e64ae54: Themes cover more of what screens had to set by hand, and the theme check measures more of what components draw.

  - Dark cards stand apart. A derived dark card now reaches 1.1:1 against both the page and a sunken canvas, and its hovered and pressed fills, overlays, and borders move up with it. Byte Forge's dark cards move from `#14171d` (equal to the sunken canvas) to `#1d2128`.
  - Every type step has a `text-*` utility, including the 13px `text-body-compact`, `text-body-snug`, `text-heading-page`, and `text-code-sm`.
  - Letter spacing is a theme input: `letterSpacing` in `createTheme` for every step, or per step in `type`. Each step emits `--ds-letter-spacing-<step>`, and its `text-*` utility sets it.
  - `--ds-shadow-glow` (`shadow-glow`) is a glow in the brand fill color: cast below in light mode, spread evenly and stronger in dark mode. `color.glow` tunes it, and `0` turns it off.
  - `findTargetSizeFailures` reads rem control heights at 16px.
  - `shippedThemePairs` adds 45 pairs that a registered theme must pass: chart and status fills on their tracks on each surface, the dark brand fill on its track, chart colors on `chart-grid`, the marks on a selected row, and the dark card step. Lab themes keep `contrastPairs`.
  - To pass the new pairs, Byte Forge's light `chart-3` moves from `#00967c` to `#00947b`. A warning ProgressBar draws in `border-warning`, so the amber warning fill of badges, banners, and buttons stays as it was. A derived dark brand fill that cannot show on its track gets lighter and keeps white text.

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
