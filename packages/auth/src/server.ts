import type { IncomingHttpHeaders } from "node:http";

import { getServerAuthConfig } from "./auth.config";
import { AUTH_DEFINITIONS } from "./auth.definition";
import type { AuthSession, LoginInput, ServerAuth } from "./auth.type";

const DEFAULT_DEV_USER = {
  id: "dev-user",
  email: "test@test.test",
  name: "Test User"
} as const;

function readHeader(headers: Headers | IncomingHttpHeaders, name: string): string | null {
  if (headers instanceof Headers) {
    return headers.get(name);
  }

  const header = headers[name.toLowerCase()];

  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return header ?? null;
}

function createSession(overrides?: Partial<AuthSession["user"]>): AuthSession {
  return {
    user: {
      id: overrides?.id ?? DEFAULT_DEV_USER.id,
      email: overrides?.email ?? DEFAULT_DEV_USER.email,
      name: overrides?.name ?? DEFAULT_DEV_USER.name
    },
    expiresAt: new Date(Date.now() + AUTH_DEFINITIONS.SESSION_MAX_AGE_SECONDS * 1000).toISOString()
  };
}

export function createServerAuth(): ServerAuth {
  const config = getServerAuthConfig();

  if (!config.secret) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  return {
    async getSessionFromHeaders(headers) {
      const userId = readHeader(headers, "x-dev-user-id");

      if (!userId) {
        return null;
      }

      const email = readHeader(headers, "x-dev-user-email") ?? DEFAULT_DEV_USER.email;
      const name = readHeader(headers, "x-dev-user-name") ?? DEFAULT_DEV_USER.name;

      return createSession({ id: userId, email, name });
    },
    async loginWithPassword(input: LoginInput) {
      if (!input.email || !input.password) {
        throw new Error("email and password are required");
      }

      return createSession({ email: input.email });
    },
    async logout() {
      return;
    }
  };
}
