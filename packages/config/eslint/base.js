import { join } from "node:path";

import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import globals from "globals";
import tseslint from "typescript-eslint";

import antiSlopConfig from "./anti-slop.js";
import apiBoundariesConfig from "./api-boundaries.js";
import domainTermsConfig from "./domain-terms.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

// Package entries that pull Node-only dependencies (AWS SDK, Postgres, mail,
// payment SDKs, pg-boss, node: builtins) and must never reach a browser or React
// Native bundle. Kept as an anchored regex so client-safe subpaths
// (@repo/storage/client, @repo/auth/{client,session,transport,form}) stay
// importable. packages/config/monorepo-alignment.test.ts follows the imports of
// every packages/* export entry and fails when an entry that reaches Node-only
// code does not match. `[.]` instead of `\.` keeps the source text identical to
// the runtime pattern for that test.
const SERVER_ONLY_ENTRY_PATTERN =
  "^(@repo/storage(/storage[.](client|config))?|@repo/auth(/(audit|server|instance|password))?|@repo/(db|email|billing|jobs)(/.*)?)$";
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
  ...apiBoundariesConfig,
  ...domainTermsConfig,
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
    settings: {
      // The plugin's TypeScript preset makes .ts/.tsx files part of the import
      // graph (the default `import/extensions` is .js only, so import/no-cycle
      // never followed a .ts dependency).
      ...importPlugin.configs.typescript.settings,
      // Every workspace runs `eslint .` from its own directory, so the tsconfig
      // globs are absolute from the repo root. The resolver picks the tsconfig
      // that includes the linted file and follows its paths and package exports.
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: ["apps", "packages", "tooling"].map((group) =>
            join(REPO_ROOT, group, "*", "tsconfig.json")
          )
        }
      }
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
      // bugs; bounded depth keeps the check fast on a large graph. The SCC
      // pre-pass walks the whole reachable graph (every workspace's source)
      // with no depth bound and made apps/api lint 25s instead of 6s; turning
      // it off changes no findings, because it only skips acyclic edges.
      "import/no-cycle": ["error", { maxDepth: 10, ignoreExternal: true, disableScc: true }],
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
    // DOM clients (web, desktop, the shared UI, and the tooling UIs) must not pull
    // React Native UI primitives or server-only entries.
    files: [
      "apps/web/**/*.{ts,tsx}",
      "apps/desktop/**/*.{ts,tsx}",
      "packages/ui/**/*.{ts,tsx}",
      "packages/ui-3d/**/*.{ts,tsx}",
      "tooling/desk-ui/**/*.{ts,tsx}"
    ],
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
