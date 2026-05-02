import {
  getCurrentOrganizationByScope,
  listOrganizationMembersByScope,
  listOrganizationsByScope
} from "./organizations.adapter";
import type { ApiContext } from "../../context";
import { requireAuthenticatedOrganizationScope } from "../../middleware/auth.middleware";

type ResolverContext = ApiContext;

export const organizationsResolvers = {
  Query: {
    async organizations(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const scope = requireAuthenticatedOrganizationScope(ctx);
      return listOrganizationsByScope(scope);
    },
    async currentOrganization(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const scope = requireAuthenticatedOrganizationScope(ctx);
      return getCurrentOrganizationByScope(scope);
    },
    async members(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const scope = requireAuthenticatedOrganizationScope(ctx);
      return listOrganizationMembersByScope(scope);
    }
  }
};
