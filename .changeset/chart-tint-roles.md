---
"@repo/theme": minor
"@repo/ui": minor
"@repo/mobile-ui": patch
---

Each chart color has a tint and a text color, for category tiles, tags, and avatars.

- Twelve color roles: `background-chart-1` to `background-chart-6`, a pale fill in each chart color's hue (`bg-ds-bg-chart-N`), and `text-chart-1` to `text-chart-6`, its text color (`text-ds-text-chart-N`). They reach web, mobile, and NativeWind like every role.
- `createTheme` derives them from the final chart colors, so a theme that sets its own chart colors keeps its tints in step. A tint the theme sets wins, and its text color is derived against it. `createCategoryColors` derives them for a theme built by hand.
- `contrastPairs` adds 36 pairs, which lab themes pass too: ink, `text-subtle`, and the text color on each tint, and each text color on the page, cards, and sunken areas. The chart color is not measured on its tint, so a theme can set a mid-tone pastel; an icon or a mark on a tint takes the text color.
- `AvatarFallback`'s chart tones draw the tint with its text color, not the chart color at 20% with ink.
- A `PlotFill` of `{ type: "tint", color: "chart-N" }` paints a mark in the tint, such as a bar that carries ink text. `RadialProgress`'s `fill` draws a chart slot's tint.
