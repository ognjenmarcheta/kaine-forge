import type { AuthSession } from "./auth.type";

export function authHeaders(session: AuthSession | null): Record<string, string> {
  if (!session) {
    return {};
  }

  return {
    "x-dev-user-email": session.user.email,
    "x-dev-user-id": session.user.id,
    "x-dev-user-name": session.user.name
  };
}
