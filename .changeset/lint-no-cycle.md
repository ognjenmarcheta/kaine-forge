---
"@repo/config": minor
---

Add `import/no-cycle` (error, bounded `maxDepth: 10`, `ignoreExternal`) to the shared ESLint config so circular imports — which break tree-shaking and cause init-order bugs — are caught in CI. The repo currently has zero cycles, so the rule ships as an error.
