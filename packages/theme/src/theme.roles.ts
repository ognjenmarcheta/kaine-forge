// The semantic token names every theme defines. Code reads them as --ds-<name>.

export const colorRoles = [
  "text",
  "text-subtle",
  "text-subtlest",
  "text-inverse",
  "text-disabled",
  "text-brand",
  "text-success",
  "text-danger",
  "text-warning",
  "text-warning-inverse",
  "text-brand-inverse",
  "text-information",
  "text-discovery",
  "text-selected",
  "text-surface-inverse",
  "link",
  "link-pressed",
  "icon",
  "icon-subtle",
  "icon-brand",
  "icon-danger",
  "background-default",
  "background-neutral-subtle",
  "background-neutral-subtle-hovered",
  "background-neutral-subtle-pressed",
  "background-neutral",
  "background-neutral-hovered",
  "background-neutral-pressed",
  "background-neutral-bold",
  "background-brand-bold",
  "background-brand-bold-hovered",
  "background-brand-bold-pressed",
  "background-success",
  "background-success-bold",
  "background-danger",
  "background-danger-bold",
  "background-danger-bold-hovered",
  "background-danger-bold-pressed",
  "background-warning",
  "background-warning-bold",
  "background-warning-bold-hovered",
  "background-warning-bold-pressed",
  // "Waiting on you": warning colors today, apart from real warnings so a theme can retune it.
  "background-attention",
  "background-attention-bold",
  "text-attention",
  "border-attention",
  "background-information",
  "background-information-bold",
  "background-discovery",
  "background-discovery-bold",
  "background-selected",
  "background-selected-bold",
  "surface",
  "surface-sunken",
  "surface-sunken-bold",
  "surface-inverse",
  "surface-raised",
  "surface-raised-hovered",
  "surface-raised-pressed",
  "surface-overlay",
  "border",
  "border-strong",
  "border-bold",
  // Selected, pressed, and current state borders: border-bold contrast, never border-strong.
  "border-state",
  "border-focused",
  "border-selected",
  "border-brand",
  "border-success",
  "border-danger",
  "border-warning",
  "border-information",
  "border-discovery",
  "blanket",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-grid",
  // The pale tint and the text color of each chart color, for tiles, tags, and avatars.
  "background-chart-1",
  "background-chart-2",
  "background-chart-3",
  "background-chart-4",
  "background-chart-5",
  "background-chart-6",
  "text-chart-1",
  "text-chart-2",
  "text-chart-3",
  "text-chart-4",
  "text-chart-5",
  "text-chart-6"
] as const;

export const shadowRoles = [
  "shadow-raised",
  "shadow-overlay",
  "shadow-floating",
  "shadow-floating-bold",
  "shadow-glow"
] as const;

export const scaleTokenNames = [
  "motion-control",
  "motion-overlay",
  "motion-drawer",
  "motion-easing",
  "motion-distance-dialog",
  "motion-distance-menu",
  "motion-press-scale",
  "space-0",
  "space-025",
  "space-050",
  "space-075",
  "space-100",
  "space-150",
  "space-200",
  "space-250",
  "space-300",
  "space-400",
  "space-500",
  "space-600",
  "space-800",
  "space-1000",
  "font-family-sans",
  "font-family-mono",
  "font-family-heading",
  "font-weight-regular",
  "font-weight-medium",
  "font-weight-semibold",
  "font-weight-bold",
  "line-height-default",
  "line-height-tight",
  "letter-spacing-heading",
  "border-width",
  "border-width-selected",
  "border-width-focused",
  "border-width-thick",
  "radius-050",
  "radius-100",
  "radius-200",
  "radius-250",
  "radius-300",
  "radius-round",
  "radius-pill",
  "control-xsmall",
  "control-small",
  "control-medium",
  "control-large",
  "control-xlarge"
] as const;

export const typeStepNames = [
  "display",
  "heading-xlarge",
  "heading-large",
  "heading-medium",
  "heading-small",
  "heading-xsmall",
  "heading-xxsmall",
  "body-large",
  "body",
  "body-small",
  "body-xsmall",
  "heading-page",
  "heading-card",
  "heading-row",
  "body-comfortable",
  "body-snug",
  "body-compact",
  "code-small"
] as const;

/** Component tokens: the per-component knobs a theme turns for shape, density, and depth. */
export const componentTokenNames = [
  "button-radius",
  "button-font-weight",
  "field-radius",
  "field-border",
  "card-radius",
  "card-padding",
  "card-shadow",
  "overlay-radius",
  "dialog-radius",
  "badge-radius"
] as const;

/**
 * The five text styles of a screen, each an alias of one type step. Label is the floor: nothing
 * reads smaller. The older steps stay for other apps. Web only.
 */
export const typeStyles = {
  title: "heading-large",
  heading: "heading-small",
  body: "body",
  label: "body-small",
  mono: "code-small"
} as const;

/** Row and card spacing for the two densities, set by data-density on an app root. Web only. */
export const densityTokens = {
  comfortable: {
    "density-row-y": "var(--ds-space-150)",
    "density-row-x": "var(--ds-space-250)",
    "density-card": "var(--ds-space-250)",
    "density-gap": "var(--ds-space-300)",
    "density-section": "var(--ds-space-200)"
  },
  compact: {
    "density-row-y": "var(--ds-space-075)",
    "density-row-x": "var(--ds-space-200)",
    "density-card": "var(--ds-space-200)",
    "density-gap": "var(--ds-space-200)",
    "density-section": "var(--ds-space-150)",
    "control-medium": "var(--ds-control-small)",
    "control-large": "2.25rem"
  }
} as const;

/** Named stacking layers and layout widths, so no component picks a z-index or width of its own. Web only. */
export const layoutTokens = {
  "layer-raised": "1",
  "layer-sticky": "20",
  "layer-nav": "30",
  "layer-menu": "35",
  "layer-blanket": "40",
  "layer-popover": "45",
  "layer-toast": "60",
  "layout-sidebar": "15rem",
  "layout-sidebar-collapsed": "4rem",
  "layout-rail": "20rem",
  "layout-measure": "48rem",
  "layout-page": "90rem",
  "layout-tabbar": "3.5rem",
  // The smallest pointer target (WCAG 2.2 SC 2.5.8).
  "layout-hit": "var(--ds-control-xsmall)"
} as const;
