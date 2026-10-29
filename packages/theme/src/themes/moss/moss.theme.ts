import { createTheme } from "../../theme.create";

/** The example custom theme: everything Byte Forge sets, chosen differently. */
export const mossTheme = createTheme({
  name: "moss",
  label: "Moss",
  description:
    "Warm stone neutrals with a forest green for actions, serif headings, compact controls, and flat bordered cards.",
  color: { brand: "#2f6b4f", neutral: { hue: 70, chroma: 0.012 } },
  fonts: {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Helvetica, Arial, sans-serif',
    heading:
      'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
  },
  nativeFonts: { heading: "system-serif" },
  headingWeight: 600,
  density: "compact",
  depth: "border",
  components: {
    "button-radius": "6px",
    "field-radius": "4px",
    "card-radius": "6px",
    "overlay-radius": "6px",
    "dialog-radius": "8px",
    "badge-radius": "4px"
  }
});
