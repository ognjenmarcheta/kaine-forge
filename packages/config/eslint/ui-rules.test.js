import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { uiRules } from "./ui-rules.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } }
  }
});

// Reads the real tokens.generated.css, so a renamed or removed token fails here first.
ruleTester.run("no-unknown-token", uiRules.rules["no-unknown-token"], {
  valid: [
    'const a = "bg-ds-surface-raised text-ds-text-subtle hover:bg-ds-bg-neutral-hovered";',
    'const b = "gap-ds-150 p-ds-200 h-ds-control-medium -right-ds-050";',
    'const c = "fill-ds-chart-1 border-ds-field-border";'
  ],
  invalid: [
    { code: 'const a = "bg-ds-surface-raise";', errors: 1 },
    { code: 'const b = "text-ds-text-muted";', errors: 1 },
    { code: 'const c = "p-ds-175";', errors: 1 }
  ]
});

// Tailwind defaults that the web theme resets generate no CSS.
ruleTester.run("no-reset-default", uiRules.rules["no-reset-default"], {
  valid: [
    'const a = "rounded-md rounded-t-card rounded-full shadow-raised shadow-none md:shadow-card";',
    'const b = "text-body text-heading-sm font-semibold bg-transparent rounded-[3px]";'
  ],
  invalid: [
    { code: 'const d = "size-4 rounded border";', errors: 1 },
    { code: 'const e = "hover:shadow-md rounded-2xl";', errors: 2 },
    { code: 'const f = "text-sm font-light";', errors: 2 },
    { code: 'const g = "bg-red-500 text-white";', errors: 2 }
  ]
});

ruleTester.run("no-transition-all", uiRules.rules["no-transition-all"], {
  valid: ['const a = "transition-colors transition-transform";'],
  invalid: [{ code: 'const a = "h-4 transition-all";', errors: 1 }]
});

ruleTester.run("no-outline-none", uiRules.rules["no-outline-none"], {
  valid: [
    'const a = "outline-none focus-visible:ring-2";',
    'cn("outline-none", "focus-visible:border-ds-border-focused");'
  ],
  invalid: [{ code: 'const a = "rounded-md outline-none";', errors: 1 }]
});

ruleTester.run("icon-button-label", uiRules.rules["icon-button-label"], {
  valid: [
    'const a = <Button aria-label={t("todos.delete")}><Trash2 /></Button>;',
    'const b = <Button><Plus />{t("todos.add")}</Button>;',
    "const c = <Button {...props}><Trash2 /></Button>;"
  ],
  invalid: [
    { code: "const a = <Button><Trash2 /></Button>;", errors: 1 },
    { code: '<button type="button"><X className="h-4" /></button>;', errors: 1 }
  ]
});
