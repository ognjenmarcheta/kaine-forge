import type { ApiContext } from "../../context";

type ResolverContext = ApiContext;

export const organizationsResolvers = {
  Query: {
    async organizations(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      const organizations = await ctx.auth.listOrganizationsByScope(scope);
      // An API Key reaches its own Organization only, never its creator's others.
      return scope.apiKeyId
        ? organizations.filter((organization) => organization.id === scope.organizationId)
        : organizations;
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
    },
    organizationPermissions(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      return ctx.requireOrganizationScope().membership.permissions;
    }
  }
};
