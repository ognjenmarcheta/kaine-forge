import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/src-tauri/target/**",
      "**/src-tauri/gen/**",
      "apps/*/src/graphql/generated/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    plugins: {
      import: importPlugin
    },
    rules: {
      "import/order": [
        "error",
        {
          groups: [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true }
        }
      ],
      "@typescript-eslint/no-explicit-any": "error",
      // Package public API is the exports map; never deep-import package source trees.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@repo/*/src", "@repo/*/src/*", "@repo/*/src/**"],
              message:
                "Import through package exports (@repo/<pkg> or documented subpaths), not @repo/*/src/**."
            }
          ]
        }
      ]
    }
  },
  {
    // Web/desktop must not pull React Native UI primitives.
    files: ["apps/web/**/*.{ts,tsx}", "apps/desktop/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@repo/*/src", "@repo/*/src/*", "@repo/*/src/**"],
              message:
                "Import through package exports (@repo/<pkg> or documented subpaths), not @repo/*/src/**."
            },
            {
              group: ["@repo/mobile-ui", "@repo/mobile-ui/*"],
              message: "Use @repo/ui for web/desktop. @repo/mobile-ui is React Native only."
            }
          ]
        }
      ]
    }
  },
  {
    // Mobile must not pull React DOM UI primitives.
    files: ["apps/mobile/**/*.{ts,tsx}", "packages/mobile-ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@repo/*/src", "@repo/*/src/*", "@repo/*/src/**"],
              message:
                "Import through package exports (@repo/<pkg> or documented subpaths), not @repo/*/src/**."
            },
            {
              group: ["@repo/ui", "@repo/ui/*"],
              message: "Use @repo/mobile-ui for React Native. @repo/ui is web/desktop only."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    }
  }
];
