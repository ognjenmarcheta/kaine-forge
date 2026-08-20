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
