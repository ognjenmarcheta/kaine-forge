---
"@repo/config": minor
---

Add `anti-slop/*` ESLint rules ported from dmmulroy/anti-slop: ban chained type assertions, `Shape` in type names, `unknown`-concealing aliases, `Reflect.get`/`Reflect.apply`, and the broad `object` type; require a `// SAFETY:` invariant comment on every non-const type assertion in non-test code. Lint task inputs now include `packages/config/eslint/**` so shared rule changes invalidate workspace lint caches.
