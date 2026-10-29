---
"@repo/ui": patch
---

A `PlotAnchor` or `PlotTooltip` now measures its content hidden at the plot's origin before it places it. A place computed without the size could reach past the plot, and a phone browser that laid the page out with it there widened the page for good.
