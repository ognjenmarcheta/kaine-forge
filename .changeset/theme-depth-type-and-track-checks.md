---
"@repo/theme": minor
"@repo/ui": minor
"@repo/mobile-ui": patch
---

Themes cover more of what screens had to set by hand, and the theme check measures more of what components draw.

- Dark cards stand apart. A derived dark card now reaches 1.1:1 against both the page and a sunken canvas, and its hovered and pressed fills, overlays, and borders move up with it. Byte Forge's dark cards move from `#14171d` (equal to the sunken canvas) to `#1d2128`.
- Every type step has a `text-*` utility, including the 13px `text-body-compact`, `text-body-snug`, `text-heading-page`, and `text-code-sm`.
- Letter spacing is a theme input: `letterSpacing` in `createTheme` for every step, or per step in `type`. Each step emits `--ds-letter-spacing-<step>`, and its `text-*` utility sets it.
- `--ds-shadow-glow` (`shadow-glow`) is a glow in the brand fill color: cast below in light mode, spread evenly and stronger in dark mode. `color.glow` tunes it, and `0` turns it off.
- `findTargetSizeFailures` reads rem control heights at 16px.
- `shippedThemePairs` adds 45 pairs that a registered theme must pass: chart and status fills on their tracks on each surface, the dark brand fill on its track, chart colors on `chart-grid`, the marks on a selected row, and the dark card step. Lab themes keep `contrastPairs`.
- To pass the new pairs, Byte Forge's light `chart-3` moves from `#00967c` to `#00947b`. A warning ProgressBar draws in `border-warning`, so the amber warning fill of badges, banners, and buttons stays as it was. A derived dark brand fill that cannot show on its track gets lighter and keeps white text.
