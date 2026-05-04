import type { AuthSession, AuthSessionUser } from "./auth.type";

export interface AuthenticatedOrganizationScope {
  organizationId: string;
  user: AuthSessionUser;
  userId: string;
}

export function requireAuthenticatedOrganizationScope(
  session: AuthSession | null
): AuthenticatedOrganizationScope {
  if (!session) {
    throw new Error("authentication required");
  }

  if (!session.activeOrganizationId) {
    throw new Error("active organization required");
  }

  return {
    organizationId: session.activeOrganizationId,
    user: session.user,
    userId: session.user.id
  };
}
