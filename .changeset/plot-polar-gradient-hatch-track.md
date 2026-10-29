---
"@repo/ui": minor
---

Chart pieces that the new lab screens had to build locally.

- `PlotArcs` takes `radii`: how far each slice reaches, as a share of the ring's radius. Equal slices with their own reach make a polar area chart; the reach tweens, and labels sit halfway out on each slice.
- A gradient `PlotFill` takes `stops` through several colors, such as a flow from yellow through green to teal.
- A hatch `PlotFill` takes a `base`, a solid color or a chart tint under its lines, so a hatched part on a pale base is one fill instead of two layers.
- `PlotBars` takes `trackPad`, which grows the track around the bar and before its baseline into a row.
- `PlotColor` adds `"sunken"`, the well color, where every chart color keeps 3:1.
