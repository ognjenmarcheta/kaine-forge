import type { CodegenConfig } from "@graphql-codegen/cli";

const webDocuments = ["../../apps/web/src/**/*.graphql"];
const mobileDocuments = ["../../apps/mobile/src/**/*.graphql"];

const config: CodegenConfig = {
  schema: "../../apps/api/schema.graphql",
  ignoreNoDocuments: true,
  // Keep generated client files format:check-clean without a manual prettier pass.
  hooks: {
    afterAllFileWrite: ["prettier --write"]
  },
  generates: {
    "../../apps/web/src/graphql/generated/": {
      documents: webDocuments,
      preset: "client",
      plugins: []
    },
    "../../apps/web/src/graphql/generated/react-query.ts": {
      documents: webDocuments,
      // operations + react-query only: avoids duplicate types with typescript plugin (v6/v7).
      plugins: ["typescript-operations", "typescript-react-query"],
      config: {
        documentMode: "string",
        preResolveTypes: true,
        onlyOperationTypes: true,
        skipTypename: true,
        scalars: {
          DateTime: "string"
        },
        exposeMutationKeys: true,
        exposeQueryKeys: true,
        fetcher: {
          func: "../../lib/graphql-codegen-fetcher#useGraphqlFetcher",
          isReactHook: true
        },
        legacyMode: false,
        reactQueryVersion: 5
      }
    },
    "../../apps/mobile/src/graphql/generated/": {
      documents: mobileDocuments,
      preset: "client",
      plugins: []
    },
    "../../apps/mobile/src/graphql/generated/react-query.ts": {
      documents: mobileDocuments,
      plugins: ["typescript-operations", "typescript-react-query"],
      config: {
        documentMode: "string",
        preResolveTypes: true,
        onlyOperationTypes: true,
        skipTypename: true,
        scalars: {
          DateTime: "string"
        },
        exposeMutationKeys: true,
        exposeQueryKeys: true,
        fetcher: {
          func: "../../lib/graphql-codegen-fetcher#useGraphqlFetcher",
          isReactHook: true
        },
        legacyMode: false,
        reactQueryVersion: 5
      }
    }
  }
};

export default config;
