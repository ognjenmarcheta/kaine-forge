---
"@repo/graphql-codegen": patch
"@repo/web": patch
"@repo/mobile": patch
---

Remove the unused `@graphql-codegen/typescript` dependency (the codegen config uses only the `client` preset plus `typescript-operations`/`typescript-react-query`), declare `@commitlint/types` at the root for the commitlint config's JSDoc type import, and refresh generated GraphQL clients with the lockfile-current codegen toolchain. Fixes the `pnpm knip` failure on `main` and the latent `graphql-schema` regeneration drift.
