export interface AuthenticatedOrganizationScopeUser {
  email?: string;
  id: string;
  name?: string;
}

export interface AuthenticatedOrganizationScope {
  organizationId: string;
  user: AuthenticatedOrganizationScopeUser;
  userId: string;
}

export function requireAuthenticatedOrganizationScope(ctx: {
  activeOrganizationId: string | null;
  user: AuthenticatedOrganizationScopeUser | null;
}): AuthenticatedOrganizationScope {
  if (!ctx.user) {
    throw new Error("authentication required");
  }

  if (!ctx.activeOrganizationId) {
    throw new Error("active organization required");
  }

  return {
    organizationId: ctx.activeOrganizationId,
    user: ctx.user,
    userId: ctx.user.id
  };
}
