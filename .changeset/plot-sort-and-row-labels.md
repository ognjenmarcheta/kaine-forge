---
"@repo/ui": minor
---

Fixes for what four new lab screens found in the kit.

- `PlotBars` names each bar by its category, so bars that change order, such as sorted ones, slide to their new places instead of each place morphing into another bar. `usePlotTween` takes the same `keys` for custom marks.
- `PlotAnchor`'s `y` takes a category on a band y scale, the center of that row, so one anchor per row labels every bar of a row chart.
- A `SidebarMenuButton` tooltip that is hidden (an expanded sidebar, or a phone) no longer opens on focus. Open and hidden, it was the top layer and took the first Escape, so the phone sheet needed two.
- A `Table`'s `scrollLabel` names its scroller as a group, not a region landmark, so a name like its card's no longer duplicates the card's landmark (axe `landmark-unique`).
- `PlotLegend`'s `square` swatch is square, not rounded.
