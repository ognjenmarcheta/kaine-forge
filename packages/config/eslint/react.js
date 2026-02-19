import reactHooks from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";

import baseConfig from "./base.js";

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
  {
    files: [
      "apps/web/src/**/*.{tsx,jsx}",
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
        }
      ]
    }
  }
];
