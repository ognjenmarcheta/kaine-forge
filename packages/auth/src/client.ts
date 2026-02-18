import { getClientAuthConfig } from "./auth.config";
import type { AuthSession, ClientAuth, LoginInput } from "./auth.type";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`auth request failed: ${String(response.status)}`);
  }

  return (await response.json()) as T;
}

export function createClientAuth(): ClientAuth {
  const config = getClientAuthConfig();

  return {
    async getSession() {
      const response = await fetch(`${config.baseUrl}/api/auth/session`, {
        method: "GET"
      });

      if (response.status === 204) {
        return null;
      }

      const body = await parseJsonResponse<{ session: AuthSession | null }>(response);
      return body.session;
    },
    async loginWithPassword(input: LoginInput) {
      const response = await fetch(`${config.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      const body = await parseJsonResponse<{ session: AuthSession }>(response);
      return body.session;
    },
    async logout() {
      const response = await fetch(`${config.baseUrl}/api/auth/logout`, {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`auth logout failed: ${String(response.status)}`);
      }
    }
  };
}
