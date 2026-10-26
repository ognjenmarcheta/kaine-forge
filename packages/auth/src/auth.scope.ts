import type { AuthSession, AuthSessionUser } from "./auth.type";

export interface AuthenticatedOrganizationMembership {
  id: string;
  role: string;
  userId: string;
}

/**
 * The Active Organization of a Session whose user is a proven member of it.
 * `resolveOrganizationScope` is its only producer.
 */
export interface AuthenticatedOrganizationScope {
  membership: AuthenticatedOrganizationMembership;
  organizationId: string;
  user: AuthSessionUser;
  userId: string;
}

export interface OrganizationMembershipProof extends AuthenticatedOrganizationMembership {
  organizationId: string;
}

export interface ResolveOrganizationScopeInput {
  getMembership: (input: {
    organizationId: string;
    userId: string;
  }) => Promise<OrganizationMembershipProof | null>;
  session: AuthSession | null;
}

export interface OrganizationScopeResolution {
  /** Null when there is no Session or the Session has no Active Organization. */
  organizationScope: AuthenticatedOrganizationScope | null;
  /** Returns the scope, or throws why the request has none. */
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
}

/**
 * Resolves a Session into its Authenticated Organization Scope. Throws
 * `organization not accessible` when the user is not a member of the Active
 * Organization, so no scope without proven membership ever exists.
 */
export async function resolveOrganizationScope(
  input: ResolveOrganizationScopeInput
): Promise<OrganizationScopeResolution> {
  const { session } = input;

  if (!session?.activeOrganizationId) {
    const reason = session ? "active organization required" : "authentication required";
    return {
      organizationScope: null,
      requireOrganizationScope: () => {
        throw new Error(reason);
      }
    };
  }

  const organizationId = session.activeOrganizationId;
  const membership = await input.getMembership({ organizationId, userId: session.user.id });

  if (!membership || membership.organizationId !== organizationId) {
    throw new Error("organization not accessible");
  }

  const organizationScope: AuthenticatedOrganizationScope = {
    membership: { id: membership.id, role: membership.role, userId: membership.userId },
    organizationId,
    user: session.user,
    userId: session.user.id
  };

  return { organizationScope, requireOrganizationScope: () => organizationScope };
}
