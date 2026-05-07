import type { AuthSession, ServerAuth } from "@repo/auth/auth.type";
import {
  requireAuthenticatedOrganizationScope,
  resolveAuthenticatedOrganizationScope,
  type AuthenticatedOrganizationScope
} from "@repo/auth/scope";

export interface ApiAuthIdentity {
  organizationScope: AuthenticatedOrganizationScope | null;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
  session: AuthSession | null;
}

export function createApiAuthIdentity(session: AuthSession | null): ApiAuthIdentity {
  const organizationScope = session?.activeOrganizationId
    ? requireAuthenticatedOrganizationScope(session)
    : null;

  return {
    organizationScope,
    requireOrganizationScope: () =>
      organizationScope ?? requireAuthenticatedOrganizationScope(session),
    session
  };
}

export async function resolveApiAuthIdentity(
  session: AuthSession | null,
  auth: Pick<ServerAuth, "getOrganizationMembershipProof">
): Promise<ApiAuthIdentity> {
  const organizationScope = session?.activeOrganizationId
    ? await resolveAuthenticatedOrganizationScope({
        getMembership: auth.getOrganizationMembershipProof,
        session
      })
    : null;

  return {
    organizationScope,
    requireOrganizationScope: () =>
      organizationScope ?? requireAuthenticatedOrganizationScope(session),
    session
  };
}
