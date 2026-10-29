---
"@repo/ui": minor
---

`RadialProgress`, `Gauge`, `ProportionBar`, and `ProgressBar` cover more designs without local copies. The new options are opt-in, so current screens render as before.

- `RadialProgress` draws in plain SVG, without loading the chart library, and sweeps to a new value on the motion tokens. It takes a number `size` for any ring size, `valuePosition="end"`, a `fill` disc, `innerRatio`, and `interaction`.
- `Gauge` takes `center` for your own middle, `legend={false}`, `innerRatio` for the ring's thickness, and `segmentCaps="butt"`. Each part has a `data-slot`.
- `ProportionBar` answers the pointer and the keyboard as the charts do (DATA-5): hover, focus, or a tap rings a part and shows its name and value, the arrow keys walk the parts, a click or Enter pins one, and Escape lets it go. Parts grow to new values on the motion tokens. `interaction={false}` keeps the old still bar; `tooltip={false}` and `onActiveChange` let a screen show the active part itself. A segment's `fill="hatch"` draws it as lines, and `height` sets any thickness.
- `ProgressBar` takes `height`, `track` (`neutral`, `sunken`, `hatch`, or `none`), several `parts`, and `gap`.
- The `bg-hatch` utility draws a hatched part in HTML, in the text color.
