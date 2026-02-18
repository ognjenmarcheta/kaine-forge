/** @type {import("tailwindcss").Config} */
export default {
  theme: {
    extend: {
      colors: {
        text: {
          default: "var(--color-text-default)",
          subtle: "var(--color-text-subtle)",
          inverse: "var(--color-text-inverse)",
          danger: "var(--color-text-danger)",
          success: "var(--color-text-success)",
          warning: "var(--color-text-warning)"
        },
        background: {
          default: "var(--color-background-default)",
          surface: "var(--color-background-surface)",
          raised: "var(--color-background-surface-raised)",
          brand: "var(--color-background-brand-bold)",
          danger: "var(--color-background-danger)",
          success: "var(--color-background-success)",
          neutral: "var(--color-background-neutral)"
        },
        border: {
          default: "var(--color-border-default)",
          focused: "var(--color-border-focused)",
          brand: "var(--color-border-brand)",
          danger: "var(--color-border-danger)"
        }
      },
      boxShadow: {
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
        floating: "var(--shadow-floating)"
      },
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        10: "40px",
        12: "48px",
        16: "64px"
      }
    }
  }
};
