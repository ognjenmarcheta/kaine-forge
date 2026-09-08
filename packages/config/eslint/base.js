import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import globals from "globals";
import tseslint from "typescript-eslint";

import antiSlopConfig from "./anti-slop.js";

// Package entries that pull Node-only dependencies (AWS SDK, Postgres, mail,
// node:crypto) and must never reach a browser or React Native bundle. Kept as
// an anchored regex so client-safe subpaths (@repo/storage/client,
// @repo/auth/{client,session,transport,form}) stay importable. `[.]` instead of
// `\.` keeps the source text identical to the runtime pattern for the contract
// test in packages/config/monorepo-alignment.test.ts.
const SERVER_ONLY_ENTRY_PATTERN =
  "^(@repo/storage(/storage[.](client|config))?|@repo/auth(/(server|instance|password))?|@repo/(db|email)(/.*)?)$";
const SERVER_ONLY_ENTRY_MESSAGE =
  "Server-only package entry: it bundles Node-only dependencies into the client. Import a client-safe entry instead (@repo/storage/client, @repo/auth/client|session|transport|form).";

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
  ...antiSlopConfig,
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
      // Circular imports break tree-shaking and cause hard-to-debug init-order
      // bugs; bounded depth keeps the check fast on a large graph.
      "import/no-cycle": ["error", { maxDepth: 10, ignoreExternal: true }],
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
            },
            {
              // Anchored regex, not a gitignore group: a `@repo/storage` group would
              // also block the client-safe `@repo/storage/client` subpath.
              regex: SERVER_ONLY_ENTRY_PATTERN,
              message: SERVER_ONLY_ENTRY_MESSAGE
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
            },
            {
              regex: SERVER_ONLY_ENTRY_PATTERN,
              message: SERVER_ONLY_ENTRY_MESSAGE
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
  },
  {
    // Type-aware bug-catching rules powered by the TypeScript project service.
    // ESLint runs from the repo root, so tsconfigRootDir is intentionally
    // omitted and defaults to cwd (the repo root); hardcoding import.meta.dirname
    // would wrongly point at packages/config/eslint.
    files: ["**/*.{ts,tsx,mts,cts}"],
    ignores: [
      "**/*.config.*",
      "**/*.cjs",
      "scripts/**",
      ".ai/**",
      "tooling/**",
      "**/*.d.ts",
      // Not covered by any tsconfig project, so type info is unavailable:
      // the repo root has no tsconfig, and @repo/config ships only JS config
      // plus TS test files with no tsconfig of its own.
      "vitest.workspace.ts",
      "packages/config/**/*.ts"
    ],
    languageOptions: {
      parserOptions: {
        projectService: true
      }
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error"
    }
  }
];
