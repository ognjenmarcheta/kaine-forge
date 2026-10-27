import type { Permission } from "./auth.permissions";
import type { AuthSession, AuthSessionUser } from "./auth.type";

export interface AuthenticatedOrganizationMembership {
  id: string;
  /** What the role grants in this Organization, Custom Roles included, read with the membership. */
  permissions: readonly Permission[];
  role: string;
  userId: string;
}

/**
 * The Active Organization of a Session whose user is a proven member of it,
 * or the Organization of an API Key whose creator is still a member.
 * `resolveOrganizationScope` and `resolveApiKeyScope` are its only producers.
 */
export interface AuthenticatedOrganizationScope {
  /**
   * Set when an API Key authenticated the request. Such a scope reaches its
   * Organization's shared data only: never its creator's own data or their
   * other Organizations.
   */
  apiKeyId?: string;
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
    membership: {
      id: membership.id,
      permissions: membership.permissions,
      role: membership.role,
      userId: membership.userId
    },
    organizationId,
    user: session.user,
    userId: session.user.id
  };

  return { organizationScope, requireOrganizationScope: () => organizationScope };
}

/** A verified API Key: its Organization, its creator, and the Permissions it grants. */
export interface VerifiedApiKey {
  id: string;
  /** Null for a key whose metadata names no creator. */
  creatorUserId: string | null;
  organizationId: string;
  permissions: readonly Permission[];
}

export interface ResolveApiKeyScopeInput {
  apiKey: VerifiedApiKey;
  getMembership: ResolveOrganizationScopeInput["getMembership"];
  getUser: (userId: string) => Promise<AuthSessionUser | null>;
}

/**
 * Resolves a verified API Key into an Authenticated Organization Scope for the
 * key's Organization, acting as its creator. Its Permissions are the ones the
 * key grants that the creator still holds there. Null when the creator is gone
 * or no longer a member, so the request gets 401.
 */
export async function resolveApiKeyScope(
  input: ResolveApiKeyScopeInput
): Promise<AuthenticatedOrganizationScope | null> {
  const { apiKey } = input;

  if (!apiKey.creatorUserId) {
    return null;
  }

  const membership = await input.getMembership({
    organizationId: apiKey.organizationId,
    userId: apiKey.creatorUserId
  });
  const user = membership ? await input.getUser(apiKey.creatorUserId) : null;

  if (!membership || membership.organizationId !== apiKey.organizationId || !user) {
    return null;
  }

  const granted = new Set(apiKey.permissions);

  return {
    apiKeyId: apiKey.id,
    membership: {
      id: membership.id,
      permissions: membership.permissions.filter((permission) => granted.has(permission)),
      role: membership.role,
      userId: membership.userId
    },
    organizationId: apiKey.organizationId,
    user,
    userId: user.id
  };
}

/** Whether the scope's member holds `permission` in the Active Organization. */
export function hasOrganizationPermission(
  scope: AuthenticatedOrganizationScope,
  permission: Permission
): boolean {
  return scope.membership.permissions.includes(permission);
}

/** Throws `permission required: <permission>` unless the scope's member holds it. */
export function requireOrganizationPermission(
  scope: AuthenticatedOrganizationScope,
  permission: Permission
): void {
  if (!hasOrganizationPermission(scope, permission)) {
    throw new Error(`permission required: ${permission}`);
  }
}
