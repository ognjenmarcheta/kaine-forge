// The context-boundary rule for apps/api features (ADR 0025). A feature imports
// another feature of its own context freely. It imports another context only
// when its context uses that context, and only through that feature's public files.
//
// The rule resolves relative specifiers with path math, not the import resolver,
// so its result depends only on the file path and the specifier.
import { dirname, resolve, sep } from "node:path";

import { API_CONTEXTS, API_PUBLIC_FILES } from "./api-contexts.js";

const FEATURE_PATH = /\/apps\/api\/src\/features\/([^/]+)(?:\/(.+))?$/;
const SOURCE_EXTENSION = /\.[mc]?[jt]sx?$/;
const MAP_FILE = "packages/config/eslint/api-contexts.js";

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
                uses: { type: "array", items: { type: "string" } }
              },
              required: ["name", "features", "uses"],
              additionalProperties: false
            }
          },
          publicFiles: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } }
          }
        },
        required: ["contexts"],
        additionalProperties: false
      }
    ],
    messages: {
      contextNotAllowed: `{{from}} does not use {{to}}, so it cannot import {{target}}. Keep the work in {{from}}, or add the edge to ${MAP_FILE} and the CONTEXT.md Context map if the dependency is intended.`,
      notPublic: `{{target}} is internal to {{to}}. Import one of its public files instead: {{allowed}}. To publish another file, add it to API_PUBLIC_FILES in ${MAP_FILE}.`,
      unknownFeature: `Feature "{{feature}}" belongs to no context. Add it to API_CONTEXTS in ${MAP_FILE} and to the CONTEXT.md Context map.`
    }
  },
  create(context) {
    const [{ contexts, publicFiles = {} }] = context.options;
    const source = locate(context.filename);

    if (!source) {
      return {};
    }

    const contextOf = new Map(contexts.flatMap((entry) => entry.features.map((f) => [f, entry])));

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
      ImportDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => node.source && check(node.source),
      ImportExpression: (node) => node.source.type === "Literal" && check(node.source)
    };
  }
};

export const apiBoundariesPlugin = {
  meta: { name: "api" },
  rules: { "context-boundaries": contextBoundaries }
};

export default [
  {
    files: ["apps/api/src/features/**/*.{ts,tsx,mts,cts}"],
    // Tests and fixtures may wire real collaborators from other contexts.
    ignores: ["**/*.test.ts", "**/*.test-helpers.ts", "**/*.fixture.ts"],
    plugins: { api: apiBoundariesPlugin },
    rules: {
      "api/context-boundaries": ["error", { contexts: API_CONTEXTS, publicFiles: API_PUBLIC_FILES }]
    }
  }
];
