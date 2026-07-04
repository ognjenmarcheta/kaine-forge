import type { ApiContext } from "../../context";

type ResolverContext = ApiContext;

export const organizationsResolvers = {
  Query: {
    async organizations(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return ctx.auth.listOrganizationsByScope(scope);
    },
    async currentOrganization(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return ctx.auth.getCurrentOrganizationByScope(scope);
    },
    async members(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return ctx.auth.listOrganizationMembersByScope(scope);
    },
    async invitations(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return ctx.auth.listInvitationsByScope(scope);
    }
  }
};
