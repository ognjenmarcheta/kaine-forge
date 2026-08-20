// Ported from dmmulroy/anti-slop (Oxlint) to our ESLint stack. Rules live in a
// dedicated plugin namespace so they never collide with the no-restricted-syntax
// composition in react.js.
const SHAPE_NAME = /Shape/;
const SAFETY_COMMENT = /^\s*SAFETY:\s*\S/;

const noChainedTypeAssertions = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow chained type assertions (`x as A as B`), which fabricate type evidence instead of proving it."
    },
    schema: [],
    messages: {
      chained:
        "Chained type assertions fabricate evidence. Assert once from a validated value, or parse at the boundary."
    }
  },
  create(context) {
    return {
      TSAsExpression(node) {
        if (node.expression.type === "TSAsExpression") {
          context.report({ node, messageId: "chained" });
        }
      }
    };
  }
};

const noShapeInSymbolNames = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        'Disallow "Shape" in type-like declaration names; name the concept, not its container.'
    },
    schema: [],
    messages: {
      shape:
        'Do not use "Shape" in type names. Name the concept itself (e.g. `User`, `UserRecord`).'
    }
  },
  create(context) {
    const checkDeclarationName = (node) => {
      if (node.id && node.id.type === "Identifier" && SHAPE_NAME.test(node.id.name)) {
        context.report({ node: node.id, messageId: "shape" });
      }
    };
    return {
      TSInterfaceDeclaration: checkDeclarationName,
      TSTypeAliasDeclaration: checkDeclarationName,
      TSEnumDeclaration: checkDeclarationName,
      ClassDeclaration: checkDeclarationName
    };
  }
};

const noUnknownTypeAliases = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow type aliases that merely conceal `unknown`."
    },
    schema: [],
    messages: {
      concealed:
        "This alias only conceals `unknown`. Parse the value at the boundary or use `unknown` directly so callers must narrow."
    }
  },
  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation.type === "TSUnknownKeyword") {
          context.report({ node, messageId: "concealed" });
        }
      }
    };
  }
};

const isAsConst = (node) =>
  node.typeAnnotation.type === "TSTypeReference" &&
  node.typeAnnotation.typeName.type === "Identifier" &&
  node.typeAnnotation.typeName.name === "const";

// Climbing stops at these so a SAFETY comment on an enclosing statement counts,
// but a comment above a whole class or block does not excuse assertions inside it.
const CLIMB_BOUNDARIES = new Set([
  "Program",
  "BlockStatement",
  "SwitchCase",
  "ClassBody",
  "TSModuleBlock",
  "StaticBlock"
]);

const requireSafetyCommentForTypeAssertion = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a `SAFETY:` comment stating the checked invariant before each non-const type assertion."
    },
    schema: [],
    messages: {
      missing:
        'Type assertions need a preceding "// SAFETY: <checked invariant>" comment, or a refactor (narrowing, `satisfies`, boundary parsing) that removes the assertion.'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const hasSafetyBefore = (node) =>
      sourceCode.getCommentsBefore(node).some((comment) => SAFETY_COMMENT.test(comment.value));
    return {
      TSAsExpression(node) {
        if (isAsConst(node)) {
          return;
        }
        // Chained assertions belong to no-chained-type-assertions.
        if (node.expression.type === "TSAsExpression" || node.parent.type === "TSAsExpression") {
          return;
        }
        let current = node;
        for (;;) {
          if (hasSafetyBefore(current)) {
            return;
          }
          const parent = current.parent;
          if (!parent || CLIMB_BOUNDARIES.has(parent.type)) {
            break;
          }
          current = parent;
        }
        context.report({ node, messageId: "missing" });
      }
    };
  }
};

export const antiSlopPlugin = {
  meta: { name: "anti-slop" },
  rules: {
    "no-chained-type-assertions": noChainedTypeAssertions,
    "no-shape-in-symbol-names": noShapeInSymbolNames,
    "no-unknown-type-aliases": noUnknownTypeAliases,
    "require-safety-comment-for-type-assertion": requireSafetyCommentForTypeAssertion
  }
};

export default [
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    plugins: {
      "anti-slop": antiSlopPlugin
    },
    rules: {
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "Reflect",
          property: "get",
          message:
            "Use typed property access, or parse the object at the boundary, instead of Reflect.get."
        },
        {
          object: "Reflect",
          property: "apply",
          message: "Call the function directly with typed arguments instead of Reflect.apply."
        }
      ],
      "@typescript-eslint/no-restricted-types": [
        "error",
        {
          types: {
            object: {
              message:
                "The broad `object` type carries no evidence. Use a named interface or a generic."
            }
          }
        }
      ]
    }
  },
  {
    // Test doubles routinely need free-form assertions; the SAFETY contract
    // applies to production and tooling code only.
    files: ["**/*.{ts,tsx,mts,cts}"],
    ignores: ["**/*.test.*", "**/*.spec.*", "**/*.d.ts"],
    rules: {
      "anti-slop/require-safety-comment-for-type-assertion": "error"
    }
  }
];
