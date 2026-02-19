import {
  getCurrentOrganizationById,
  listOrganizationMembersByOrganizationId,
  listOrganizationsByUserId
} from "./organizations.adapter";
import type { ApiContext } from "../../context";
import { requireActiveOrganizationId, requireUser } from "../../middleware/auth.middleware";

type ResolverContext = ApiContext;

export const organizationsResolvers = {
  Query: {
    async organizations(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const user = requireUser(ctx);
      return listOrganizationsByUserId(user.id);
    },
    async currentOrganization(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const activeOrganizationId = requireActiveOrganizationId(ctx);
      return getCurrentOrganizationById(user.id, activeOrganizationId);
    },
    async members(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const activeOrganizationId = requireActiveOrganizationId(ctx);
      return listOrganizationMembersByOrganizationId(user.id, activeOrganizationId);
    }
  }
};
