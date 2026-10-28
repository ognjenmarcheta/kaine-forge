/** @type {import("tailwindcss").Config} */
export default {
  theme: {
    extend: {
      colors: {
        "ds-text": {
          DEFAULT: "var(--ds-text)",
          subtle: "var(--ds-text-subtle)",
          subtlest: "var(--ds-text-subtlest)",
          inverse: "var(--ds-text-inverse)",
          disabled: "var(--ds-text-disabled)",
          brand: {
            DEFAULT: "var(--ds-text-brand)",
            inverse: "var(--ds-text-brand-inverse)"
          },
          success: "var(--ds-text-success)",
          danger: "var(--ds-text-danger)",
          warning: {
            DEFAULT: "var(--ds-text-warning)",
            inverse: "var(--ds-text-warning-inverse)"
          },
          information: "var(--ds-text-information)",
          discovery: "var(--ds-text-discovery)",
          selected: "var(--ds-text-selected)"
        },
        "ds-bg": {
          DEFAULT: "var(--ds-background-default)",
          neutral: {
            DEFAULT: "var(--ds-background-neutral)",
            subtle: "var(--ds-background-neutral-subtle)",
            "subtle-hovered": "var(--ds-background-neutral-subtle-hovered)",
            "subtle-pressed": "var(--ds-background-neutral-subtle-pressed)",
            hovered: "var(--ds-background-neutral-hovered)",
            pressed: "var(--ds-background-neutral-pressed)",
            bold: "var(--ds-background-neutral-bold)"
          },
          brand: {
            bold: "var(--ds-background-brand-bold)",
            "bold-hovered": "var(--ds-background-brand-bold-hovered)",
            "bold-pressed": "var(--ds-background-brand-bold-pressed)"
          },
          success: {
            DEFAULT: "var(--ds-background-success)",
            bold: "var(--ds-background-success-bold)"
          },
          danger: {
            DEFAULT: "var(--ds-background-danger)",
            bold: "var(--ds-background-danger-bold)",
            "bold-hovered": "var(--ds-background-danger-bold-hovered)",
            "bold-pressed": "var(--ds-background-danger-bold-pressed)"
          },
          warning: {
            DEFAULT: "var(--ds-background-warning)",
            bold: "var(--ds-background-warning-bold)",
            "bold-hovered": "var(--ds-background-warning-bold-hovered)",
            "bold-pressed": "var(--ds-background-warning-bold-pressed)"
          },
          information: {
            DEFAULT: "var(--ds-background-information)",
            bold: "var(--ds-background-information-bold)"
          },
          discovery: {
            DEFAULT: "var(--ds-background-discovery)",
            bold: "var(--ds-background-discovery-bold)"
          },
          selected: {
            DEFAULT: "var(--ds-background-selected)",
            bold: "var(--ds-background-selected-bold)"
          }
        },
        "ds-border": {
          DEFAULT: "var(--ds-border)",
          bold: "var(--ds-border-bold)",
          focused: "var(--ds-border-focused)",
          selected: "var(--ds-border-selected)",
          brand: "var(--ds-border-brand)",
          success: "var(--ds-border-success)",
          danger: "var(--ds-border-danger)",
          warning: "var(--ds-border-warning)",
          information: "var(--ds-border-information)",
          discovery: "var(--ds-border-discovery)"
        },
        "ds-surface": {
          DEFAULT: "var(--ds-surface)",
          sunken: "var(--ds-surface-sunken)",
          raised: "var(--ds-surface-raised)",
          "raised-hovered": "var(--ds-surface-raised-hovered)",
          "raised-pressed": "var(--ds-surface-raised-pressed)",
          overlay: "var(--ds-surface-overlay)"
        },
        "ds-icon": {
          DEFAULT: "var(--ds-icon)",
          subtle: "var(--ds-icon-subtle)",
          brand: "var(--ds-icon-brand)",
          danger: "var(--ds-icon-danger)"
        },
        "ds-link": {
          DEFAULT: "var(--ds-link)",
          pressed: "var(--ds-link-pressed)"
        },
        "ds-blanket": {
          DEFAULT: "var(--ds-blanket)"
        }
      },
      fontFamily: {
        sans: "var(--ds-font-family-sans)",
        mono: "var(--ds-font-family-mono)"
      },
      fontSize: {
        "heading-xl": ["1.8125rem", { lineHeight: "1.1" }],
        "heading-lg": ["1.5rem", { lineHeight: "1.17" }],
        "heading-md": ["1.25rem", { lineHeight: "1.2" }],
        "heading-sm": ["1rem", { lineHeight: "1.25" }],
        "heading-xs": ["0.875rem", { lineHeight: "1.14" }],
        "heading-xxs": ["0.75rem", { lineHeight: "1.33" }],
        "body-lg": ["1rem", { lineHeight: "1.5" }],
        body: ["0.875rem", { lineHeight: "1.43" }],
        "body-sm": ["0.75rem", { lineHeight: "1.5" }],
        "body-xs": ["0.6875rem", { lineHeight: "1.45" }]
      },
      fontWeight: {
        regular: "var(--ds-font-weight-regular)",
        medium: "var(--ds-font-weight-medium)",
        semibold: "var(--ds-font-weight-semibold)",
        bold: "var(--ds-font-weight-bold)"
      },
      lineHeight: {
        default: "var(--ds-lineHeight-default)",
        tight: "var(--ds-lineHeight-tight)"
      },
      borderRadius: {
        none: "0",
        sm: "var(--ds-radius-050)",
        DEFAULT: "var(--ds-radius-100)",
        md: "var(--ds-radius-100)",
        lg: "var(--ds-radius-200)",
        xl: "var(--ds-radius-300)",
        full: "9999px"
      },
      borderColor: {
        DEFAULT: "var(--ds-border)",
        bold: "var(--ds-border-bold)",
        focused: "var(--ds-border-focused)",
        selected: "var(--ds-border-selected)",
        brand: "var(--ds-border-brand)",
        success: "var(--ds-border-success)",
        danger: "var(--ds-border-danger)",
        warning: "var(--ds-border-warning)",
        information: "var(--ds-border-information)",
        discovery: "var(--ds-border-discovery)"
      },
      boxShadow: {
        raised: "var(--ds-shadow-raised)",
        overlay: "var(--ds-shadow-overlay)",
        floating: "var(--ds-shadow-floating)",
        none: "none"
      },
      spacing: {
        "ds-025": "var(--ds-space-025)",
        "ds-050": "var(--ds-space-050)",
        "ds-075": "var(--ds-space-075)",
        "ds-100": "var(--ds-space-100)",
        "ds-150": "var(--ds-space-150)",
        "ds-200": "var(--ds-space-200)",
        "ds-250": "var(--ds-space-250)",
        "ds-300": "var(--ds-space-300)",
        "ds-400": "var(--ds-space-400)",
        "ds-500": "var(--ds-space-500)",
        "ds-600": "var(--ds-space-600)",
        "ds-800": "var(--ds-space-800)",
        "ds-1000": "var(--ds-space-1000)"
      }
    }
  }
};
