import type { IncomingHttpHeaders } from "node:http";

import { auth } from "./auth.instance";
import { listInvitationsForScope } from "./auth.server.invitation";
import {
  getCurrentOrganizationForScope,
  getOrganizationMembershipProof,
  listOrganizationMembersForScope,
  listOrganizationsForUser
} from "./auth.server.organization";
import type { AuthSession, ServerAuth } from "./auth.type";

function toFetchHeaders(headers: Headers | IncomingHttpHeaders): Headers {
  if (headers instanceof Headers) {
    return headers;
  }

  const fetchHeaders = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      fetchHeaders.set(name, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        fetchHeaders.append(name, entry);
      }
    }
  }

  return fetchHeaders;
}

export function createServerAuth(): ServerAuth {
  return {
    async getSessionFromHeaders(headers): Promise<AuthSession | null> {
      const result = await auth.api.getSession({
        headers: toFetchHeaders(headers)
      });

      if (!result) {
        return null;
      }

      return {
        user: {
          id: result.user.id,
          email: result.user.email,
          emailVerified: result.user.emailVerified,
          name: result.user.name
        },
        expiresAt: new Date(result.session.expiresAt).toISOString(),
        activeOrganizationId: result.session.activeOrganizationId ?? null
      };
    },
    listOrganizationsByScope(scope) {
      return listOrganizationsForUser(scope.userId);
    },
    getCurrentOrganizationByScope(scope) {
      return getCurrentOrganizationForScope(scope);
    },
    getOrganizationMembershipProof(params) {
      return getOrganizationMembershipProof(params);
    },
    listOrganizationMembersByScope(scope) {
      return listOrganizationMembersForScope(scope);
    },
    listInvitationsByScope(scope) {
      return listInvitationsForScope(scope);
    }
  };
}
