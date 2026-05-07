import type { AuthSession, AuthSessionUser } from "./auth.type";

export interface AuthenticatedOrganizationMembership {
  id: string;
  role: string;
  userId: string;
}

export interface AuthenticatedOrganizationScope {
  membership?: AuthenticatedOrganizationMembership;
  organizationId: string;
  user: AuthSessionUser;
  userId: string;
}

export interface OrganizationMembershipProof extends AuthenticatedOrganizationMembership {
  organizationId: string;
}

export interface ResolveAuthenticatedOrganizationScopeInput {
  getMembership: (input: {
    organizationId: string;
    userId: string;
  }) => Promise<OrganizationMembershipProof | null>;
  session: AuthSession | null;
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

export async function resolveAuthenticatedOrganizationScope(
  input: ResolveAuthenticatedOrganizationScopeInput
): Promise<AuthenticatedOrganizationScope> {
  const scope = requireAuthenticatedOrganizationScope(input.session);
  const membership = await input.getMembership({
    organizationId: scope.organizationId,
    userId: scope.userId
  });

  if (!membership || membership.organizationId !== scope.organizationId) {
    throw new Error("organization not accessible");
  }

  return {
    ...scope,
    membership: {
      id: membership.id,
      role: membership.role,
      userId: membership.userId
    }
  };
}
