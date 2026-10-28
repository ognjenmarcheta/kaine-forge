# UI guidelines

These rules apply to every screen in the web app, the desktop app, the agent desk, and the mobile app, under any theme. Each rule has an ID, a reason, and an example. Cite the ID in reviews and in deviation notes, for example "COLOR-2".

Rules marked **MUST** protect accessibility or data. The others are strong defaults.

## Precedence

When rules and requests pull in different directions, decide in this order:

1. **MUST rules.** Accessibility and data rules always hold.
2. **The requested look.** A screenshot to recreate, a brand book, a `DESIGN.md`, or the owner's direction sets the palette, type, shape, density, and mood. It wins over the template defaults, including the default theme and the visual-taste rules in `DESIGN_SYSTEM.md` §13.
3. **Template defaults.** The default theme and the rules below.

When the requested look breaks a MUST rule, stay as close to the look as the rule allows, then list each change as a deviation: the rule ID, what changed, and why. Example: "COLOR-1: white label on the yellow tile was 1.9:1; the label is ink, 12.6:1."

## LAYOUT

**LAYOUT-1. Shape the screen around the task.** Start from what the person does: scan a list, compare numbers, edit a record. Pick the structure that serves it: a table, a list with dividers, a split view, or a form.
Reason: a grid of floating cards makes people hunt; structure carries meaning.
Do: one `Table` for 40 invoices. Don't: 40 cards in a grid.

**LAYOUT-2. One page heading.** Start each shell page with `PageHeader`; it holds the only `h1`.
Reason: one clear title orients people and screen readers.
Do: `<PageHeader title={t("todos.title")} />`. Don't: a second `h1` inside a card.

**LAYOUT-3. No card inside a card.** Use a section, a divider, or a list inside a card.
Reason: nested frames add borders and padding without adding meaning.
Do: `SettingsSection` blocks separated by dividers. Don't: `<Card><Card>…</Card></Card>`.

**LAYOUT-4. Keep reading width.** Prose and forms stop at about 768px. Tables and dashboards may use the full width.
Reason: long lines are hard to read.
Do: `max-w-3xl` on a note editor. Don't: a paragraph across a 1600px screen.

**LAYOUT-5. Hold the layout still.** Reserve space for values that load or change: skeletons of the same size, fixed widths for counters.
Reason: shifting content makes people lose their place and click the wrong thing.
Do: `StatCard` with `value={undefined}` while loading. Don't: a tile that grows when its number arrives.

## TYPE

**TYPE-1. Use the type steps.** Set text with `text-heading-*` and `text-body*`, which read the theme's type tokens.
Reason: a theme can change the scale and the fonts in one place.
Do: `text-heading-sm`. Don't: `text-[15px]` or `text-sm` (it generates no CSS).

**TYPE-2. Keep heading levels in order.** Choose the element by structure (`h2` under `h1`) and the size by the type step.
Reason: screen-reader users move by heading level.
Do: `<h2 className="text-heading-xs">`. Don't: skip from `h1` to `h4` for a smaller look.

**TYPE-3. Align figures.** Numbers that change or line up in columns use `tabular-nums`.
Reason: proportional digits make columns and counters jitter.
Do: `<TableCell className="tabular-nums text-end">`. Don't: right-aligned prices in proportional digits.

**TYPE-4. Keep content at least body-small.** Use `text-body-xs` only for metadata such as timestamps.
Reason: small text fails people with low vision first.
Do: `text-body-sm` for a table cell. Don't: `text-body-xs` for a paragraph.

**TYPE-5. Do not scale type with the viewport width.** Change the layout at a breakpoint instead.
Reason: viewport-scaled text breaks zoom and reflow (WCAG 2.2 SC 1.4.4).

## SPACE

**SPACE-1. Use the spacing steps.** Use `p-ds-*`, `gap-ds-*`, and `m-ds-*`.
Reason: one scale keeps rhythm across screens and themes.
Do: `gap-ds-150`. Don't: `gap-[13px]`.

**SPACE-2. Group by distance.** Items in a group sit closer (4–8px) than the groups (16–24px).
Reason: people read proximity as relationship before they read labels.
Do: label and field 4px apart, fields 16px apart.

**SPACE-3. Take card padding from the theme.** Use `p-card` and `rounded-card`, so density follows the theme.
Reason: a compact theme then makes every card compact.
Do: `<Card>` as is. Don't: `<Card className="p-6">`.

## COLOR

**COLOR-1 (MUST). Meet contrast through role pairs.** Text reaches 4.5:1 and UI graphics 3:1 against what is behind them (WCAG 2.2 SC 1.4.3, 1.4.11). Use the pairs the theme check measures: a text role on its surface or its matching background.
Reason: the theme check proves those pairs in every theme and mode; other pairs are unproven.
Do: `text-ds-text-success` on `bg-ds-bg-success`. Don't: `text-ds-text-subtlest` on `bg-ds-bg-brand-bold`.

**COLOR-2 (MUST). Never use color alone.** Pair every status color with a word, an icon, or a shape.
Reason: color-blind people and grayscale screens lose color-only meaning.
Do: a red badge that says "Overdue". Don't: a red dot with no label.

**COLOR-3. Choose roles by meaning.** `danger` means destructive or failed, `success` means done, `brand` means the next action.
Reason: a theme can change the hues; the meaning must stay.
Do: `appearance="danger"` for Delete. Don't: the danger color for a heading because red looks good there.

**COLOR-4. One filled primary action per view.** Other actions use subtle, ghost, or link buttons.
Reason: one emphasized action tells people what to do next.

**COLOR-5. Tokens only.** No hex, rgb, or hsl values and no default Tailwind palette in components.
Reason: raw values do not follow the theme or the color mode.
Do: `bg-ds-surface-raised`. Don't: `bg-white` or `bg-[#fff]`.

**COLOR-6. Chart series take the chart colors in order.** Use `chart-1` to `chart-6` and the grid color. Show at most six series; group the rest as "Other". Give a series a fixed `color` only when its meaning sets the color: a role such as `"success"` for a target met, or `"neutral"` for a comparison period.
Reason: the chart colors and the role borders reach 3:1 in every theme, and a meaning-based color keeps its series recognizable when other series come and go.
Do: `{ key: "lastYear", label: t("…"), color: "neutral" }`. Don't: `className="text-[#22c55e]"` on a chart.

## MOTION

**MOTION-1. Motion explains a change.** Animate an element that enters, leaves, or changes state. Do not decorate.
Reason: decorative motion distracts and costs battery.

**MOTION-2. Use the motion tokens.** Durations `--ds-motion-control` (120ms), `--ds-motion-overlay` (180ms), and `--ds-motion-drawer` (220ms), with `--ds-motion-easing`. In class names they are `duration-control`, `duration-overlay`, `duration-drawer`, and `ease-standard`. Name the properties; never `transition: all`.
Reason: `all` animates layout properties by accident and is slow, and the tokens let a theme change the pace everywhere.
Do: `transition-colors duration-control ease-standard`. Don't: `transition-all duration-300`.

**MOTION-3 (MUST). Respect reduced motion.** When `prefers-reduced-motion: reduce` matches, remove the motion.
Reason: motion can make people with vestibular disorders ill (WCAG 2.2 SC 2.3.3).

**MOTION-4. Animate transform and opacity.** Do not animate width, height, top, or left, except the documented grid-row disclosure.
Reason: layout animation drops frames.

## STATE

**STATE-1. Every data view has four states.** Loading (`Skeleton`), empty (`EmptyState`), error (`QueryError` with retry), and content.
Reason: a blank area is indistinguishable from a broken one.

**STATE-2. Interaction states come from tokens.** Hover, pressed, focus-visible, selected, and disabled use their role tokens.
Reason: themes then restyle every state consistently.
Do: `hover:bg-ds-bg-neutral-hovered`. Don't: `hover:opacity-80`.

**STATE-3 (MUST). A failed write keeps the input.** Show the error next to the action and keep what the person typed.
Reason: lost input is lost work.

## FORM

**FORM-1 (MUST). Every field has a visible label.** Tie it to the control with `htmlFor` and `id`. A placeholder is not a label.
Reason: placeholders vanish on input and fail screen readers (WCAG 2.2 SC 3.3.2).

**FORM-2 (MUST). Errors are text.** Show the error under the field with an icon, link it with `aria-describedby`, and set `aria-invalid`.
Reason: a red border alone fails COLOR-2 and screen readers.

**FORM-3. Field borders use the field token.** Use `Input`, `Textarea`, or `Select`, or `border-ds-field-border`.
Reason: a field boundary is a UI graphic and needs 3:1 (WCAG 2.2 SC 1.4.11).

**FORM-4. A pending submit cannot repeat.** Disable the submit button and show progress while the request runs.
Reason: double submits create duplicates.

## A11Y

**A11Y-1 (MUST). Keyboard and visible focus.** Every interactive element is reachable by keyboard in DOM order and shows a focus ring. The ring uses `border-focused`, which the theme check measures on the page, cards, overlays, and sunken areas. On `surface-inverse` it is not measured, so draw the ring in `text-surface-inverse` there.
Reason: keyboard and switch users cannot act otherwise (WCAG 2.2 SC 2.1.1, 2.4.7), and a ring in the brand color can fade on a dark inverse bar.
Do: `focus-visible:outline-ds-text-surface-inverse` on a button in a `bg-ds-surface-inverse` tab bar. Don't: rely on the default ring there.

**A11Y-2 (MUST). Targets are at least 24px.** Primary touch actions are 44px. The theme check enforces the control heights.
Reason: small targets cause misses (WCAG 2.2 SC 2.5.8).

**A11Y-3 (MUST). Icon-only buttons have a name.** Pass a translated `aria-label`.
Reason: an unnamed button reads as "button".
Do: `<Button appearance="ghost" spacing="icon" aria-label={t("todos.delete")}><Trash2 aria-hidden /></Button>`.

**A11Y-4 (MUST). Dialogs are complete.** A title, focus trapped inside, Escape closes, and focus returns to the trigger. Use `Modal` or `ConfirmModal`.
Reason: an incomplete dialog strands keyboard and screen-reader users.

**A11Y-5 (MUST). Images have alternative text.** Informative images get `alt`; decorative ones get `alt=""` or `aria-hidden`.

**A11Y-6. Announce async status once.** Use a polite live region for "Saved" or "Thinking"; do not announce every streamed token.

**A11Y-7 (MUST). Charts have a name and the data as text.** The chart components render a titled `figure` and a visually hidden data table.
Reason: a picture of numbers is invisible to screen readers.

**A11Y-8 (MUST). A 3D view mirrors a real control.** The data and the selection live in a DOM control beside the canvas, such as a radio group of named regions; the canvas is `aria-hidden` and only shows that state. The viewer takes focus with a visible ring and works by keyboard, has 24px buttons that turn and zoom, announces selection changes, keeps the selected part at 3:1 against the model and the background, and shows the control alone when WebGL is missing. `Viewport3D` from `@repo/ui-3d` does the viewer part (`docs/ui/3d.md`).
Reason: a canvas has no accessible content, and not everyone can drag (WCAG 2.2 SC 1.1.1, 1.4.11, 2.1.1, 2.5.7, 2.5.8, 4.1.3).
Do: a "Body region" radio group drives `<Viewport3D>`, and the scene colors the checked region. Don't: let people pick a region only by clicking a mesh in the canvas.

## RESP

**RESP-1. Work at 375px.** Content reflows to one column; the page never scrolls sideways. Wide tables scroll inside their own container. Give every grid a column count at its smallest size: a grid without one sizes its column to the widest child, such as a chart or a line that does not wrap.
Reason: reflow is required at 320 CSS pixels (WCAG 2.2 SC 1.4.10).
Do: `grid grid-cols-1 md:grid-cols-3`. Don't: `grid md:grid-cols-3`.

**RESP-2. Use the shared breakpoints.** 768px for tablet layouts and 1024px for split views and rails. Inside the app shell, the sidebar takes part of the viewport, so a layout that depends on its own width switches on its container at the same steps: mark the region `@container` and use `@3xl:` (768px) and `@5xl:` (1024px).
Reason: one set of breakpoints keeps screens consistent, and a container query keeps the columns right whether the sidebar is open or not.
Do: `<div className="@container"><div className="grid grid-cols-1 @3xl:grid-cols-2">`. Don't: `lg:grid-cols-3` for cards beside an open sidebar.

**RESP-3. Hover is never the only way.** Anything revealed on hover is also reachable by focus or tap.
Reason: touch screens have no hover.

## PERF

**PERF-1. Load heavy views lazily.** Charts, editors, and large libraries load when shown.
Reason: they slow the first paint of every page otherwise.

**PERF-2. Page long lists.** Load 50 items and a "Load more" control; never render an unbounded list.
Reason: big lists freeze the page and the API.

**PERF-3. Prevent layout shift.** Give images, skeletons, and charts their final size before content arrives.

## COPY

**COPY-1 (MUST). Translate every string.** Visible text, labels, placeholders, and `aria-label` values come from translation keys.
Reason: the apps ship in English, German, and Serbian.

**COPY-2. Buttons name the action.** Use a verb and an object.
Do: "Save note". Don't: "OK".

**COPY-3. Errors say what happened and what to do.**
Do: "The theme could not be saved. Try again." Don't: "Error 500".

**COPY-4. Use sentence case** for headings, buttons, and labels.

## DATA

**DATA-1 (MUST). Show real data only.** Product screens never show invented numbers, fake trends, or placeholder analytics.
Reason: invented data misleads decisions. Demo and lab screens use clearly fixed fixture data.

**DATA-2. Pick the chart by the question.**

| Question                                     | Chart                                                              |
| -------------------------------------------- | ------------------------------------------------------------------ |
| How does it change over time?                | `LineChart` (area for volume)                                      |
| How do items compare?                        | `BarChart`                                                         |
| What are the parts of a whole?               | `BarChart stacked="percent"`, or `DonutChart` for up to five parts |
| What share does each part have, in one line? | `ProportionBar` (one bar, with the names and values as text)       |
| How far toward a goal?                       | `RadialProgress` or `ProgressBar`                                  |
| Is the trend up or down?                     | `Sparkline` in a stat tile                                         |

**DATA-3. Label units and ranges.** Every number shows its unit and every chart its time range. Format numbers and dates for the active language.

**DATA-4. Align table data.** Numbers align to the end, text to the start; long tables keep a visible header.

**DATA-5. Charts answer the pointer and the keyboard.** Hover, focus, or tap on a mark shows its value as text beside it and highlights the mark. The arrow keys reach the same values, and a click or Enter pins one where the screen has a selected point. When a control switches the data, the marks move to the new values with the motion tokens; under reduced motion they snap. Build charts from the chart components or from `Plot`, which do this by default. A sparkline inside a stat tile may stay static, because the tile shows its value.
Reason: a chart that only looks right hides its exact numbers, and keyboard and touch users need the same values as mouse users (WCAG 2.2 SC 2.1.1). Movement shows what changed when the data switches (MOTION-1).
Do: a bar that lifts and a tooltip that reads "Fri: 58%" on hover, focus, or tap. Don't: a static SVG whose values only exist in the hidden table.

**DATA-6. Every visible control works.** A filter, period, tab, or segmented control changes the data it labels, and a menu item does what it says or is not shown.
Reason: a control that does nothing breaks trust in every other control on the screen.
