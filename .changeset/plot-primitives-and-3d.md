---
"@repo/ui": minor
"@repo/ui-3d": minor
"@repo/ui-lab": minor
---

`@repo/ui` gains plot primitives for charts that a design draws its own way: `Plot`, with d3 scales, SVG marks (grid, stems, lines, areas, bands, bars with tracks, capsule highlights, dots, segmented arcs) and HTML overlays (tooltip, anchor, legend). Lab screen 23 rebuilds its charts with them and matches its reference much more closely. A plot is interactive by default: hover, focus, or tap shows a mark's value, a click pins it, the arrow keys walk the points, and marks tween to new data on the motion tokens and snap under reduced motion. `Gauge` parts answer hover and keys, and the Recharts charts animate on the token durations.

`@repo/ui-3d` is a new package for accessible 3D views. `Viewport3D` loads three.js lazily, mirrors a DOM control, turns and zooms by keys and buttons, respects reduced motion, renders on demand, and falls back when WebGL is missing. `useThemeColors` and `useThemeMaterials` color a scene from the theme tokens. Lab screen 07b shows a procedural anatomy body.

The UI lab compares a screen with its reference side by side, with a slider, or as an overlay or a difference, enlarges the reference, aligns it with `referenceCrop`, lists screens on their own page, and saves a difference image in `pnpm lab:shots`.
