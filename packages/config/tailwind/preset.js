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
          brand: "var(--ds-text-brand)",
          success: "var(--ds-text-success)",
          danger: "var(--ds-text-danger)",
          warning: {
            DEFAULT: "var(--ds-text-warning)",
            inverse: "var(--ds-text-warning-inverse)"
          },
          attention: "var(--ds-text-attention)",
          severe: "var(--ds-text-severe)",
          information: "var(--ds-text-information)",
          discovery: "var(--ds-text-discovery)",
          open: "var(--ds-text-open)",
          closed: "var(--ds-text-closed)",
          done: "var(--ds-text-done)",
          selected: "var(--ds-text-selected)",
          "accent-blue": {
            DEFAULT: "var(--ds-text-accent-blue)",
            bolder: "var(--ds-text-accent-blue-bolder)"
          },
          "accent-teal": {
            DEFAULT: "var(--ds-text-accent-teal)",
            bolder: "var(--ds-text-accent-teal-bolder)"
          },
          "accent-green": {
            DEFAULT: "var(--ds-text-accent-green)",
            bolder: "var(--ds-text-accent-green-bolder)"
          },
          "accent-lime": {
            DEFAULT: "var(--ds-text-accent-lime)",
            bolder: "var(--ds-text-accent-lime-bolder)"
          },
          "accent-yellow": {
            DEFAULT: "var(--ds-text-accent-yellow)",
            bolder: "var(--ds-text-accent-yellow-bolder)"
          },
          "accent-orange": {
            DEFAULT: "var(--ds-text-accent-orange)",
            bolder: "var(--ds-text-accent-orange-bolder)"
          },
          "accent-red": {
            DEFAULT: "var(--ds-text-accent-red)",
            bolder: "var(--ds-text-accent-red-bolder)"
          },
          "accent-magenta": {
            DEFAULT: "var(--ds-text-accent-magenta)",
            bolder: "var(--ds-text-accent-magenta-bolder)"
          },
          "accent-purple": {
            DEFAULT: "var(--ds-text-accent-purple)",
            bolder: "var(--ds-text-accent-purple-bolder)"
          }
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
            bold: "var(--ds-background-neutral-bold)",
            "bold-hovered": "var(--ds-background-neutral-bold-hovered)",
            "bold-pressed": "var(--ds-background-neutral-bold-pressed)"
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
            bold: "var(--ds-background-danger-bold)"
          },
          warning: {
            DEFAULT: "var(--ds-background-warning)",
            bold: "var(--ds-background-warning-bold)",
            "bold-hovered": "var(--ds-background-warning-bold-hovered)",
            "bold-pressed": "var(--ds-background-warning-bold-pressed)"
          },
          attention: {
            DEFAULT: "var(--ds-background-attention)",
            bold: "var(--ds-background-attention-bold)"
          },
          severe: {
            DEFAULT: "var(--ds-background-severe)",
            bold: "var(--ds-background-severe-bold)"
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
            hovered: "var(--ds-background-selected-hovered)",
            pressed: "var(--ds-background-selected-pressed)",
            bold: "var(--ds-background-selected-bold)",
            "bold-hovered": "var(--ds-background-selected-bold-hovered)",
            "bold-pressed": "var(--ds-background-selected-bold-pressed)"
          },
          open: "var(--ds-background-open)",
          closed: "var(--ds-background-closed)",
          done: "var(--ds-background-done)",
          "accent-blue": {
            subtlest: "var(--ds-background-accent-blue-subtlest)",
            subtle: "var(--ds-background-accent-blue-subtle)",
            bolder: "var(--ds-background-accent-blue-bolder)"
          },
          "accent-teal": {
            subtlest: "var(--ds-background-accent-teal-subtlest)",
            subtle: "var(--ds-background-accent-teal-subtle)",
            bolder: "var(--ds-background-accent-teal-bolder)"
          },
          "accent-green": {
            subtlest: "var(--ds-background-accent-green-subtlest)",
            subtle: "var(--ds-background-accent-green-subtle)",
            bolder: "var(--ds-background-accent-green-bolder)"
          },
          "accent-lime": {
            subtlest: "var(--ds-background-accent-lime-subtlest)",
            subtle: "var(--ds-background-accent-lime-subtle)",
            bolder: "var(--ds-background-accent-lime-bolder)"
          },
          "accent-yellow": {
            subtlest: "var(--ds-background-accent-yellow-subtlest)",
            subtle: "var(--ds-background-accent-yellow-subtle)",
            bolder: "var(--ds-background-accent-yellow-bolder)"
          },
          "accent-orange": {
            subtlest: "var(--ds-background-accent-orange-subtlest)",
            subtle: "var(--ds-background-accent-orange-subtle)",
            bolder: "var(--ds-background-accent-orange-bolder)"
          },
          "accent-red": {
            subtlest: "var(--ds-background-accent-red-subtlest)",
            subtle: "var(--ds-background-accent-red-subtle)",
            bolder: "var(--ds-background-accent-red-bolder)"
          },
          "accent-magenta": {
            subtlest: "var(--ds-background-accent-magenta-subtlest)",
            subtle: "var(--ds-background-accent-magenta-subtle)",
            bolder: "var(--ds-background-accent-magenta-bolder)"
          },
          "accent-purple": {
            subtlest: "var(--ds-background-accent-purple-subtlest)",
            subtle: "var(--ds-background-accent-purple-subtle)",
            bolder: "var(--ds-background-accent-purple-bolder)"
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
          attention: "var(--ds-border-attention)",
          severe: "var(--ds-border-severe)",
          information: "var(--ds-border-information)",
          discovery: "var(--ds-border-discovery)",
          "accent-blue": "var(--ds-border-accent-blue)",
          "accent-teal": "var(--ds-border-accent-teal)",
          "accent-green": "var(--ds-border-accent-green)",
          "accent-lime": "var(--ds-border-accent-lime)",
          "accent-yellow": "var(--ds-border-accent-yellow)",
          "accent-orange": "var(--ds-border-accent-orange)",
          "accent-red": "var(--ds-border-accent-red)",
          "accent-magenta": "var(--ds-border-accent-magenta)",
          "accent-purple": "var(--ds-border-accent-purple)"
        },
        "ds-surface": {
          DEFAULT: "var(--ds-surface)",
          sunken: "var(--ds-surface-sunken)",
          raised: "var(--ds-surface-raised)",
          "raised-hovered": "var(--ds-surface-raised-hovered)",
          "raised-pressed": "var(--ds-surface-raised-pressed)",
          overlay: "var(--ds-surface-overlay)",
          "overlay-hovered": "var(--ds-surface-overlay-hovered)",
          "overlay-pressed": "var(--ds-surface-overlay-pressed)"
        },
        "ds-icon": {
          DEFAULT: "var(--ds-icon)",
          subtle: "var(--ds-icon-subtle)",
          inverse: "var(--ds-icon-inverse)",
          disabled: "var(--ds-icon-disabled)",
          brand: "var(--ds-icon-brand)",
          success: "var(--ds-icon-success)",
          danger: "var(--ds-icon-danger)",
          warning: "var(--ds-icon-warning)",
          attention: "var(--ds-icon-attention)",
          severe: "var(--ds-icon-severe)",
          information: "var(--ds-icon-information)",
          discovery: "var(--ds-icon-discovery)",
          "accent-blue": "var(--ds-icon-accent-blue)",
          "accent-teal": "var(--ds-icon-accent-teal)",
          "accent-green": "var(--ds-icon-accent-green)",
          "accent-lime": "var(--ds-icon-accent-lime)",
          "accent-yellow": "var(--ds-icon-accent-yellow)",
          "accent-orange": "var(--ds-icon-accent-orange)",
          "accent-red": "var(--ds-icon-accent-red)",
          "accent-magenta": "var(--ds-icon-accent-magenta)",
          "accent-purple": "var(--ds-icon-accent-purple)"
        },
        "ds-link": {
          DEFAULT: "var(--ds-link)",
          pressed: "var(--ds-link-pressed)"
        },
        "ds-blanket": {
          DEFAULT: "var(--ds-blanket)",
          selected: "var(--ds-blanket-selected)"
        }
      },
      fontFamily: {
        sans: "var(--ds-font-family-sans)",
        mono: "var(--ds-font-family-mono)"
      },
      fontSize: {
        "heading-display": ["3rem", { lineHeight: "1.15" }],
        "heading-xxl": ["2.1875rem", { lineHeight: "1.14" }],
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
        light: "var(--ds-font-weight-light)",
        regular: "var(--ds-font-weight-regular)",
        medium: "var(--ds-font-weight-medium)",
        semibold: "var(--ds-font-weight-semibold)",
        bold: "var(--ds-font-weight-bold)"
      },
      lineHeight: {
        default: "var(--ds-lineHeight-default)",
        condensed: "var(--ds-lineHeight-condensed)",
        tight: "var(--ds-lineHeight-tight)"
      },
      borderRadius: {
        none: "0",
        sm: "var(--ds-radius-050)",
        DEFAULT: "var(--ds-radius-100)",
        md: "var(--ds-radius-200)",
        lg: "var(--ds-radius-300)",
        xl: "var(--ds-radius-400)",
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
        attention: "var(--ds-border-attention)",
        severe: "var(--ds-border-severe)",
        information: "var(--ds-border-information)",
        discovery: "var(--ds-border-discovery)"
      },
      boxShadow: {
        raised: "var(--ds-shadow-raised)",
        overlay: "var(--ds-shadow-overlay)",
        floating: "var(--ds-shadow-floating)",
        overflow: "var(--ds-shadow-overflow)",
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
