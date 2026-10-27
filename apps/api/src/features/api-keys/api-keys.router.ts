import type { CreateApiKeyArgs } from "./api-keys.module";
import type { ApiContext } from "../../context";
import type { PageInput } from "../../context.data";

export const apiKeysResolvers = {
  Query: {
    apiKeys(_parent: unknown, args: PageInput, ctx: ApiContext) {
      return ctx.apiKeys.list(args);
    }
  },
  Mutation: {
    createApiKey(_parent: unknown, args: { input: CreateApiKeyArgs }, ctx: ApiContext) {
      return ctx.apiKeys.create(args.input);
    },
    revokeApiKey(_parent: unknown, args: { id: string }, ctx: ApiContext) {
      return ctx.apiKeys.revoke(args.id);
    }
  }
};
