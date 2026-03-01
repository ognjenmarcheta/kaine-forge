import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "apps/api",
  "apps/desktop",
  "apps/mobile",
  "apps/web",
  "packages/auth",
  "packages/config",
  "packages/logger",
  "packages/db",
  "packages/query",
  "packages/translation",
  "packages/ui",
  "tooling/graphql-codegen"
]);
