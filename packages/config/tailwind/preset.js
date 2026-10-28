import { boxShadow, colors, fontSize, spacing } from "./preset.tokens.js";

/**
 * NativeWind preset for the mobile app. The color, spacing, shadow, and type utilities
 * come from @repo/theme (pnpm theme:build), so they carry the same names as on the web.
 * @type {import("tailwindcss").Config}
 */
export default {
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: "var(--ds-font-family-sans)",
        mono: "var(--ds-font-family-mono)"
      },
      fontSize,
      fontWeight: {
        regular: "var(--ds-font-weight-regular)",
        medium: "var(--ds-font-weight-medium)",
        semibold: "var(--ds-font-weight-semibold)",
        bold: "var(--ds-font-weight-bold)"
      },
      lineHeight: {
        default: "var(--ds-line-height-default)",
        tight: "var(--ds-line-height-tight)"
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
        DEFAULT: "var(--ds-border)"
      },
      boxShadow: {
        ...boxShadow,
        none: "none"
      },
      spacing
    }
  }
};
