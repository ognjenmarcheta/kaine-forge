---
"@repo/ui": minor
"@repo/ui-lab": minor
---

The plot primitives cover more chart designs without custom marks. All new options are opt-in, so current plots render as before.

- `PlotBars` draws horizontal rows with `orientation="horizontal"`, and stacks segments when `y0` or `x0` reads a start per bar. A stack rings as one column or row.
- `PlotLine` takes `extend`, which runs the line to the edges of the drawing area.
- `PlotArcs` takes `stroke` (an edge or an even gap), `offset` (moves a slice out), and `label` (text on each slice).
- `PlotAxis` takes `align="start"` for y labels, a `\n` in a label for a second line, and `highlight` for the active label.
- `interaction.spans` picks parts of unequal size by the part under the pointer. `interaction.rest` sets what a pinned point shows at rest: `"highlight"` holds its tooltip until people use the plot, and `"none"` shows neither ring nor tooltip.
- `PlotAnchor` and `PlotTooltip` take `side="above"`, `"below"`, and `"beside"`, which center, flip, and stay inside the plot, and `maxWidth`. A `PlotLegend` item's `fill` draws a tint or hatch swatch with an edge in its color.
- Custom marks use `usePlotTween` to move on the motion tokens and `PLOT_RING` to draw the active ring.

The UI lab's charts page shows each option.
