import type { ApiContext } from "../../context";

type ResolverContext = ApiContext;

export const billingResolvers = {
  Query: {
    async billing(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      ctx.requireOrganizationScope();
      return ctx.billing.status();
    }
  }
};
