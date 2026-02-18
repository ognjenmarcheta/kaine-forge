import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../../apps/api/schema.graphql",
  documents: ["../../apps/web/src/**/*.graphql", "../../apps/mobile/src/**/*.graphql"],
  ignoreNoDocuments: true,
  generates: {
    "../../apps/web/src/graphql/generated/": {
      preset: "client",
      plugins: []
    },
    "../../apps/mobile/src/graphql/generated/": {
      preset: "client",
      plugins: []
    }
  }
};

export default config;
