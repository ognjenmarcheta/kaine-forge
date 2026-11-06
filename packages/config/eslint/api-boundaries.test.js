import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import { apiBoundariesPlugin } from "./api-boundaries.js";
import { API_CONTEXTS } from "./api-contexts.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: "module" }
});

// A small map, so each case reads without the real one: Content uses Billing,
// Platform uses Files, and Files publishes attachment.store instead of the default files.
const options = [
  {
    contexts: [
      { name: "Billing", features: ["billing"], uses: [] },
      { name: "Content", features: ["todos", "notes"], uses: ["Billing"] },
      { name: "Files", features: ["storage"], uses: ["Content"] },
      { name: "Platform", features: ["audit"], uses: ["Files"] }
    ],
    publicFiles: { storage: ["attachment.store"] }
  }
];
const inFeature = (feature, file) => `/repo/apps/api/src/features/${feature}/${file}`;

ruleTester.run("context-boundaries", apiBoundariesPlugin.rules["context-boundaries"], {
  valid: [
    // Same feature, same context, a used context's public file, the shared
    // kernel, and packages are all open.
    { code: 'import { x } from "./todos.util";', filename: inFeature("todos", "todos.module.ts") },
    {
      code: 'import type { T } from "../todos/todos.type";',
      filename: inFeature("notes", "notes.router.ts")
    },
    {
      code: 'import { n } from "../notes/notes.schema";',
      filename: inFeature("todos", "todos.router.ts")
    },
    {
      code: 'import type { B } from "../billing/billing.module";',
      filename: inFeature("todos", "todos.module.ts")
    },
    {
      code: 'import type { B } from "../billing/billing.type";',
      filename: inFeature("todos", "todos.module.ts")
    },
    {
      code: 'import type { S } from "../storage/attachment.store";',
      filename: inFeature("audit", "audit.module.ts")
    },
    {
      code: 'import { scoped } from "../../context.data";',
      filename: inFeature("todos", "todos.module.ts")
    },
    { code: 'import { db } from "@repo/db";', filename: inFeature("billing", "billing.module.ts") },
    // Files outside features/ are the composition root: the rule does not apply.
    {
      code: 'import { r } from "./features/billing/billing.router";',
      filename: "/repo/apps/api/src/server.ts"
    }
  ].map((testCase) => ({ ...testCase, options })),
  invalid: [
    {
      code: 'import type { T } from "../todos/todos.module";',
      filename: inFeature("billing", "billing.module.ts"),
      errors: [
        {
          messageId: "contextNotAllowed",
          data: { from: "Billing", to: "Content", target: "todos/todos.module" }
        }
      ]
    },
    {
      code: 'import { r } from "../billing/billing.router";',
      filename: inFeature("notes", "notes.module.ts"),
      errors: [{ messageId: "notPublic" }]
    },
    // The same leak through a longer path, a re-export, and a dynamic import.
    {
      code: 'import { r } from "../../features/billing/billing.router";',
      filename: inFeature("todos", "todos.module.ts"),
      errors: [{ messageId: "notPublic" }]
    },
    {
      code: 'export * from "../billing/billing.schema";',
      filename: inFeature("todos", "todos.module.ts"),
      errors: [{ messageId: "notPublic" }]
    },
    {
      code: 'export { s } from "../billing/billing.schema";',
      filename: inFeature("todos", "todos.module.ts"),
      errors: [{ messageId: "notPublic" }]
    },
    {
      code: 'const m = await import("../billing/billing.router");',
      filename: inFeature("todos", "todos.module.ts"),
      errors: [{ messageId: "notPublic" }]
    },
    // An override replaces the default public files.
    {
      code: 'import { s } from "../storage/storage.module";',
      filename: inFeature("audit", "audit.module.ts"),
      errors: [{ messageId: "notPublic" }]
    },
    {
      code: 'import { s } from "../todos/todos.module";',
      filename: inFeature("reports", "reports.module.ts"),
      errors: [{ messageId: "unknownFeature", data: { feature: "reports" } }]
    },
    {
      code: 'import { s } from "../reports/reports.module";',
      filename: inFeature("todos", "todos.module.ts"),
      errors: [{ messageId: "unknownFeature", data: { feature: "reports" } }]
    }
  ].map((testCase) => ({ ...testCase, options }))
});

describe("API context map", () => {
  it("assigns every apps/api feature folder to exactly one context, and lists no missing folder", () => {
    const folders = readdirSync(join(repoRoot, "apps/api/src/features"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const mapped = API_CONTEXTS.flatMap((context) => context.features).sort();

    expect(mapped, "a feature may belong to one context only").toEqual([...new Set(mapped)]);
    expect(mapped, "add new features to API_CONTEXTS, remove deleted ones").toEqual(folders);
  });

  it("lists each context after every context it uses, so the map has no cycle", () => {
    const declared = new Set();
    const late = [];

    for (const context of API_CONTEXTS) {
      late.push(
        ...context.uses
          .filter((name) => !declared.has(name))
          .map((name) => `${context.name} → ${name}`)
      );
      declared.add(context.name);
    }

    expect(late).toEqual([]);
  });

  it("matches the CONTEXT.md Context map, which is what agents read", () => {
    const contextDoc = readFileSync(join(repoRoot, "CONTEXT.md"), "utf8");
    const section = /^## Context map\n([\s\S]*?)(?=^## )/m.exec(contextDoc)?.[1] ?? "";
    const rows = section
      .split("\n")
      .filter((line) => /^\| \*\*/.test(line))
      .map((line) => {
        const [name, features, , uses] = line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        return {
          name: name.replaceAll("**", ""),
          features: [...features.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
          uses: uses === "—" ? [] : uses.split(",").map((use) => use.trim())
        };
      });

    expect(rows).toEqual(
      API_CONTEXTS.map(({ name, features, uses }) => ({ name, features, uses }))
    );
  });
});
