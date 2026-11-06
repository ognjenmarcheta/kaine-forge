---
"@repo/config": patch
---

The `eslint-plugin-import` rules now resolve TypeScript imports through
`eslint-import-resolver-typescript`, so `import/no-cycle` checks `.ts` and `.tsx` files. It was a
no-op for them before. `no-cycle` runs with `disableScc`, which keeps cold lint near 30s.
