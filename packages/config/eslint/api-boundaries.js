// The context-boundary rule for apps/api (ADR 0025, ADR 0026). A feature imports
// another feature of its own context freely. It imports another context only
// when its context uses that context, and only through that feature's public files.
// It imports only its own context's `@repo/db/schema` tables, better-auth's
// tables, and the foreign tables the map names for it. The shared kernel
// imports no feature, because every feature imports the kernel.
//
// The rule resolves relative specifiers with path math, not the import resolver,
// so its result depends only on the file path and the specifier.
import { dirname, resolve, sep } from "node:path";

import {
  API_AUTH_TABLES,
  API_CONTEXTS,
  API_FOREIGN_TABLES,
  API_PUBLIC_FILES
} from "./api-contexts.js";

const FEATURE_PATH = /\/apps\/api\/src\/features\/([^/]+)(?:\/(.+))?$/;
const SOURCE_EXTENSION = /\.[mc]?[jt]sx?$/;
const MAP_FILE = "packages/config/eslint/api-contexts.js";
// `@repo/db` re-exports the schema, so both entries carry tables.
const SCHEMA_ENTRIES = new Set(["@repo/db", "@repo/db/schema"]);
// Every Drizzle table export of @repo/db/schema ends with this suffix.
const TABLE_NAME = /Table$/;

/** The feature and the file (without extension) of a path under apps/api/src/features. */
function locate(path) {
  const match = FEATURE_PATH.exec(path.split(sep).join("/"));
  return match ? { feature: match[1], file: (match[2] ?? "").replace(SOURCE_EXTENSION, "") } : null;
}

const contextBoundaries = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep apps/api features inside their bounded context: cross-context imports follow the context map and use public files."
    },
    schema: [
      {
        type: "object",
        properties: {
          contexts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                features: { type: "array", items: { type: "string" } },
                tables: { type: "array", items: { type: "string" } },
                uses: { type: "array", items: { type: "string" } }
              },
              required: ["name", "features", "tables", "uses"],
              additionalProperties: false
            }
          },
          publicFiles: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } }
          },
          authTables: { type: "array", items: { type: "string" } },
          foreignTables: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: {
                tables: { type: "array", items: { type: "string" } },
                reason: { type: "string" }
              },
              required: ["tables", "reason"],
              additionalProperties: false
            }
          }
        },
        required: ["contexts"],
        additionalProperties: false
      }
    ],
    messages: {
      contextNotAllowed: `{{from}} does not use {{to}}, so it cannot import {{target}}. Keep the work in {{from}}, or add the edge to ${MAP_FILE} and the CONTEXT.md Context map if the dependency is intended.`,
      notPublic: `{{target}} is internal to {{to}}. Import one of its public files instead: {{allowed}}. To publish another file, add it to API_PUBLIC_FILES in ${MAP_FILE}.`,
      unknownFeature: `Feature "{{feature}}" belongs to no context. Add it to API_CONTEXTS in ${MAP_FILE} and to the CONTEXT.md Context map.`,
      kernelImportsFeature: `The shared kernel cannot import {{target}}: every feature imports the kernel, so a kernel file that imports a feature makes them depend on each other. Move the shared type or helper into the kernel, or do the wiring in a composition root (context.ts, server.ts).`,
      tableNotOwned: `{{table}} belongs to {{owner}}, not {{from}}. Go through the owner's public module, or, when that is not possible, add the table and a reason to API_FOREIGN_TABLES["{{feature}}"] in ${MAP_FILE}.`,
      unknownTable: `{{table}} belongs to no context. Add it to the tables of its context in API_CONTEXTS, or to API_AUTH_TABLES when better-auth owns it, in ${MAP_FILE}.`,
      schemaNamespace: `Import tables from {{entry}} by name, so the context-boundary rule can check which context owns each one.`
    }
  },
  create(context) {
    const [{ contexts, publicFiles = {}, authTables = [], foreignTables = {} }] = context.options;
    const source = locate(context.filename);

    // ESLint applies the rule only to feature sources and the shared kernel,
    // so a file outside the features is a kernel file.
    if (!source) {
      return kernelChecks(context);
    }

    const contextOf = new Map(contexts.flatMap((entry) => entry.features.map((f) => [f, entry])));
    const ownerOf = new Map(contexts.flatMap((entry) => entry.tables.map((t) => [t, entry])));
    const readable = new Set([...authTables, ...(foreignTables[source.feature]?.tables ?? [])]);

    function checkTables(node) {
      if (!SCHEMA_ENTRIES.has(node.source.value) || node.importKind === "type") {
        return;
      }

      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") {
          context.report({
            node: specifier,
            messageId: "schemaNamespace",
            data: { entry: node.source.value }
          });
          continue;
        }

        if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") {
          continue;
        }

        const table =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : specifier.imported.value;

        if (!TABLE_NAME.test(table) || readable.has(table)) {
          continue;
        }

        const owner = ownerOf.get(table);
        const from = contextOf.get(source.feature);

        if (!owner) {
          context.report({ node: specifier, messageId: "unknownTable", data: { table } });
        } else if (from && owner !== from) {
          context.report({
            node: specifier,
            messageId: "tableNotOwned",
            data: { table, owner: owner.name, from: from.name, feature: source.feature }
          });
        }
      }
    }

    function check(node) {
      const specifier = node.value;

      if (typeof specifier !== "string" || !specifier.startsWith(".")) {
        return;
      }

      const target = locate(resolve(dirname(context.filename), specifier));

      if (!target || target.feature === source.feature) {
        return;
      }

      const from = contextOf.get(source.feature);
      const to = contextOf.get(target.feature);

      if (!from || !to) {
        const feature = from ? target.feature : source.feature;
        context.report({ node, messageId: "unknownFeature", data: { feature } });
        return;
      }

      if (from === to) {
        return;
      }

      const targetName = `${target.feature}/${target.file}`;

      if (!from.uses.includes(to.name)) {
        context.report({
          node,
          messageId: "contextNotAllowed",
          data: { from: from.name, to: to.name, target: targetName }
        });
        return;
      }

      const allowed = publicFiles[target.feature] ?? [
        `${target.feature}.module`,
        `${target.feature}.type`
      ];

      if (!allowed.includes(target.file)) {
        context.report({
          node,
          messageId: "notPublic",
          data: {
            target: targetName,
            to: to.name,
            allowed: allowed.map((file) => `${target.feature}/${file}`).join(", ")
          }
        });
      }
    }

    return {
      ImportDeclaration: (node) => {
        check(node.source);
        checkTables(node);
      },
      ExportAllDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => node.source && check(node.source),
      ImportExpression: (node) => node.source.type === "Literal" && check(node.source)
    };
  }
};

/** A kernel file may import other kernel files and packages, never a feature. */
function kernelChecks(context) {
  function check(node) {
    const specifier = node.value;

    if (typeof specifier !== "string" || !specifier.startsWith(".")) {
      return;
    }

    const target = locate(resolve(dirname(context.filename), specifier));

    if (target) {
      context.report({
        node,
        messageId: "kernelImportsFeature",
        data: { target: `${target.feature}/${target.file}` }
      });
    }
  }

  return {
    ImportDeclaration: (node) => check(node.source),
    ExportAllDeclaration: (node) => check(node.source),
    ExportNamedDeclaration: (node) => node.source && check(node.source),
    ImportExpression: (node) => node.source.type === "Literal" && check(node.source)
  };
}

export const apiBoundariesPlugin = {
  meta: { name: "api" },
  rules: { "context-boundaries": contextBoundaries }
};

const ruleOptions = {
  contexts: API_CONTEXTS,
  publicFiles: API_PUBLIC_FILES,
  authTables: API_AUTH_TABLES,
  foreignTables: API_FOREIGN_TABLES
};

export default [
  {
    files: [
      "apps/api/src/features/**/*.{ts,tsx,mts,cts}",
      // The shared kernel: what every feature may import.
      "apps/api/src/*.{ts,tsx,mts,cts}",
      "apps/api/src/middleware/**/*.{ts,tsx,mts,cts}"
    ],
    ignores: [
      // Tests and fixtures may wire real collaborators from other contexts.
      "**/*.test.ts",
      "**/*.test-helpers.ts",
      "**/*.fixture.ts",
      // Composition roots wire every context, so they import features.
      "apps/api/src/context.ts",
      "apps/api/src/context.loaders.ts",
      "apps/api/src/server.ts",
      "apps/api/src/index.ts",
      "apps/api/src/worker.ts",
      "apps/api/src/api.jobs.ts"
    ],
    plugins: { api: apiBoundariesPlugin },
    rules: { "api/context-boundaries": ["error", ruleOptions] }
  }
];
