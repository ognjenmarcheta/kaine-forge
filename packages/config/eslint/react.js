import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";

import baseConfig from "./base.js";
import { uiRules } from "./ui-rules.js";

// React DOM surfaces. Mobile is React Native, where the DOM accessibility rules do not apply.
const domFiles = [
  "apps/web/src/**/*.{tsx,jsx}",
  "apps/desktop/src/**/*.{tsx,jsx}",
  "packages/ui/src/**/*.{tsx,jsx}",
  "tooling/desk-ui/src/**/*.{tsx,jsx}",
  "tooling/ui-lab/src/**/*.{tsx,jsx}"
];
const nativeFiles = [
  "apps/mobile/app/**/*.{tsx,jsx}",
  "apps/mobile/src/**/*.{tsx,jsx}",
  "packages/mobile-ui/src/**/*.{tsx,jsx}"
];

// Token-only styling: color must come from --ds-* design tokens (Tailwind token
// classes), never from hardcoded values. Spread into each UI surface's
// no-restricted-syntax rule so it composes with the i18n / native-button bans
// instead of replacing them (flat config replaces rule values per file).
const themeUtilityMessage =
  "Use the theme utility for this token, such as bg-ds-surface-raised, p-ds-200, rounded-md, or text-body, not an arbitrary var(--ds-*) value. DESIGN_SYSTEM.md section 9 lists them.";

const colorTokenBans = [
  {
    selector: "Literal[value=/-\\[(#|rgb|hsl)/i]",
    message:
      "Use a --ds-* design token via a Tailwind token class, not a hardcoded arbitrary color value (e.g. bg-[#fff])."
  },
  {
    selector: "TemplateElement[value.raw=/-\\[(#|rgb|hsl)/i]",
    message:
      "Use a --ds-* design token via a Tailwind token class, not a hardcoded arbitrary color value (e.g. bg-[#fff])."
  },
  {
    selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message: "Reference a --ds-* design token, not a hardcoded hex color."
  },
  // Motion and border-width tokens have no utility, so they may stay arbitrary values.
  {
    selector: "Literal[value=/-\\[(color:|length:)?var\\(--ds-(?!motion-|border-width)/]",
    message: themeUtilityMessage
  },
  {
    selector:
      "TemplateElement[value.raw=/-\\[(color:|length:)?var\\(--ds-(?!motion-|border-width)/]",
    message: themeUtilityMessage
  }
];

export default [
  ...baseConfig,
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off"
    }
  },
  // The UI rules of docs/ui/guidelines.md that lint can check. Messages name the rule ID.
  {
    files: domFiles,
    plugins: { "jsx-a11y": jsxA11y, ui: uiRules },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Off: jsx-a11y 6.10.2 calls minimatch 3, and the minimatch ^10 security override in
      // pnpm-workspace.yaml makes the rule crash. Field and FieldLabel cover FORM-1.
      "jsx-a11y/label-has-associated-control": "off",
      // A focusable scroll region lets keyboard users scroll it (WCAG 2.2 SC 2.1.1).
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { tags: ["pre"], roles: ["tabpanel", "region", "log"], allowExpressionValues: true }
      ],
      // Containers may handle keys for roving focus and Escape; clicks still need a control.
      "jsx-a11y/no-noninteractive-element-interactions": [
        "error",
        { handlers: ["onClick", "onMouseDown", "onMouseUp", "onKeyPress"] }
      ],
      "ui/icon-button-label": "error",
      "ui/no-outline-none": "error",
      "ui/no-transition-all": "error",
      "ui/no-unknown-token": "error"
    }
  },
  {
    files: nativeFiles,
    plugins: { ui: uiRules },
    rules: {
      "ui/no-transition-all": "error",
      "ui/no-unknown-token": "error"
    }
  },
  {
    files: [
      "apps/web/src/**/*.{tsx,jsx}",
      "tooling/desk-ui/src/**/*.{tsx,jsx}",
      "apps/mobile/app/**/*.{tsx,jsx}",
      "apps/mobile/src/**/*.{tsx,jsx}"
    ],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: []
        }
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='placeholder'] > Literal[value!=null][value!='']",
          message: "Use translation key for placeholder values."
        },
        {
          selector:
            "JSXAttribute[name.name='placeholder'] > JSXExpressionContainer > Literal[value!=null][value!='']",
          message: "Use translation key for placeholder values."
        },
        {
          selector: "JSXAttribute[name.name='title'] > Literal[value!=null][value!='']",
          message: "Use translation key for title values."
        },
        {
          selector:
            "JSXAttribute[name.name='title'] > JSXExpressionContainer > Literal[value!=null][value!='']",
          message: "Use translation key for title values."
        },
        {
          selector: "JSXAttribute[name.name='aria-label'] > Literal[value!=null][value!='']",
          message: "Use translation key for aria-label values."
        },
        {
          selector:
            "JSXAttribute[name.name='aria-label'] > JSXExpressionContainer > Literal[value!=null][value!='']",
          message: "Use translation key for aria-label values."
        },
        {
          selector:
            "JSXAttribute[name.name='accessibilityLabel'] > Literal[value!=null][value!='']",
          message: "Use translation key for accessibilityLabel values."
        },
        {
          selector:
            "JSXAttribute[name.name='accessibilityLabel'] > JSXExpressionContainer > Literal[value!=null][value!='']",
          message: "Use translation key for accessibilityLabel values."
        },
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: "Use @repo/ui Button component instead of native <button>."
        },
        {
          selector: "JSXElement > JSXOpeningElement[name.name='button']",
          message: "Use @repo/ui Button component instead of native <button>."
        },
        ...colorTokenBans
      ]
    }
  },
  {
    files: ["packages/ui/src/**/*.{tsx,jsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: "Use @repo/ui Button component instead of native <button>."
        },
        ...colorTokenBans
      ]
    }
  },
  {
    // The UI lab recreates screens with fixed fixture text, so it skips the i18n rules,
    // but it must be token-only like the product UI.
    files: ["tooling/ui-lab/src/**/*.{tsx,jsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...colorTokenBans]
    }
  },
  {
    // Desktop (React DOM) and React Native UI carry no native-button rule, but
    // must still be color-token-only.
    files: ["apps/desktop/src/**/*.{tsx,jsx}", "packages/mobile-ui/src/**/*.{tsx,jsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...colorTokenBans]
    }
  },
  {
    files: ["packages/ui/src/components/primitives/button.tsx"],
    rules: {
      "no-restricted-syntax": "off"
    }
  }
];
