import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { antiSlopPlugin } from "./anti-slop.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: "module"
  }
});

ruleTester.run("no-chained-type-assertions", antiSlopPlugin.rules["no-chained-type-assertions"], {
  valid: [
    "const a = value as User;",
    "const b = value as const;",
    "const c = value satisfies string;"
  ],
  invalid: [
    {
      code: "const a = value as unknown as User;",
      errors: [{ messageId: "chained" }]
    },
    {
      code: "fn(value as object as User);",
      errors: [{ messageId: "chained" }]
    }
  ]
});

ruleTester.run("no-comment-provenance", antiSlopPlugin.rules["no-comment-provenance"], {
  valid: [
    "// Retries stop after three attempts so a dead upstream cannot pin the worker.",
    "// SAFETY: the guard above checked the id; see #123.\nconst id = value as UserId;",
    "// eslint-disable-next-line no-console -- see #123\nconsole.log(1);",
    "// @ts-expect-error the 2026-01-01 typings omit this overload\nfn();",
    "/** @see https://eslint.org/docs/latest/use/suppressions */\nconst a = 1;",
    "// Brand colors: #fff on #3b82f6, borders #000 and #1e293b, overlay #00000080.",
    "// Escape `&#123;` and link to the guide section page#123.",
    "// Since API 2025-03-31.basil the period lives on the item.",
    "// The listener is added in the constructor, before the first event.",
    "// ADR 0005 explains why unsalted hashes no longer verify.",
    'const color = "#123"; // value is a token name, not a reference'
  ],
  invalid: [
    {
      code: "// A failure leaves an orphaned object (issue #602).\nconst a = 1;",
      errors: [{ messageId: "provenance", data: { match: "issue #602" } }]
    },
    {
      code: "/** Queues one email (#703 templates). */\nconst a = 1;",
      errors: [{ messageId: "provenance", data: { match: "#703" } }]
    },
    {
      code: "// Follow-up from PR 123.\nconst a = 1;",
      errors: [{ messageId: "provenance", data: { match: "PR 123" } }]
    },
    {
      code: "// See https://github.com/acme/app/pull/42 for context.\nconst a = 1;",
      errors: [{ messageId: "provenance", data: { match: "github.com/acme/app/pull/42" } }]
    },
    {
      code: "// Re-baselined 2026-09-09 for vitest 4.\nconst a = 1;",
      errors: [{ messageId: "provenance", data: { match: "2026-09-09" } }]
    },
    {
      code: "// Correct as of Nov 2026.\nconst a = 1;",
      errors: [{ messageId: "provenance", data: { match: "Nov 2026" } }]
    },
    {
      code: "// This default was changed in a later commit.\nconst a = 1;",
      errors: [{ messageId: "provenance", data: { match: "changed in a later commit" } }]
    },
    {
      code: "const a = 1; // see #12\nconst b = 2; /* since #13 */",
      errors: [
        { messageId: "provenance", line: 1 },
        { messageId: "provenance", line: 2 }
      ]
    }
  ]
});

ruleTester.run("no-shape-in-symbol-names", antiSlopPlugin.rules["no-shape-in-symbol-names"], {
  valid: [
    "interface User { id: string }",
    "type Result = { ok: boolean };",
    "const shape = schema.shape;",
    "class Circle {}"
  ],
  invalid: [
    {
      code: "interface UserShape { id: string }",
      errors: [{ messageId: "shape" }]
    },
    {
      code: "type ResultShape = { ok: boolean };",
      errors: [{ messageId: "shape" }]
    },
    {
      code: "class ShapeRegistry {}",
      errors: [{ messageId: "shape" }]
    }
  ]
});

ruleTester.run("no-unknown-type-aliases", antiSlopPlugin.rules["no-unknown-type-aliases"], {
  valid: ["type A = string;", "type B = unknown[];", "type C = Record<string, string>;"],
  invalid: [
    {
      code: "type ExternalValue = unknown;",
      errors: [{ messageId: "concealed" }]
    },
    {
      code: "export type Payload = unknown;",
      errors: [{ messageId: "concealed" }]
    }
  ]
});

ruleTester.run(
  "require-safety-comment-for-type-assertion",
  antiSlopPlugin.rules["require-safety-comment-for-type-assertion"],
  {
    valid: [
      "const a = value as const;",
      "// SAFETY: parseUserId validated the identifier before branding it.\nconst id = value as UserId;",
      "const id = /* SAFETY: validated upstream */ value as UserId;",
      "function f() {\n  // SAFETY: the guard above narrowed the union.\n  return value as UserId;\n}",
      "// SAFETY: the fetch schema guarantees this field.\nfn(value as UserId);",
      // Chained assertions belong to no-chained-type-assertions.
      "const a = value as unknown as User;"
    ],
    invalid: [
      {
        code: "const id = value as UserId;",
        errors: [{ messageId: "missing" }]
      },
      {
        code: "fn(value as UserId);",
        errors: [{ messageId: "missing" }]
      },
      {
        code: "// SAFETY:\nconst id = value as UserId;",
        errors: [{ messageId: "missing" }]
      },
      {
        code: "class Store {\n  // a class-level comment must not excuse members\n  load() {\n    return value as UserId;\n  }\n}",
        errors: [{ messageId: "missing" }]
      }
    ]
  }
);
