import type { AuthSession } from "@repo/auth/auth.type";
import {
  requireAuthenticatedOrganizationScope,
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
