import { getClientAuthConfig } from "./auth.config";
import type {
  AuthOrganization,
  CreateOrganizationInput,
  AuthSession,
  ClientAuth,
  LoginInput,
  SignupInput
} from "./auth.type";

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
      const response = await fetch(`${config.baseUrl}/api/auth/get-session`, {
        credentials: "include",
        method: "GET"
      });

      if (response.status === 204) {
        return null;
      }

      const body = await parseJsonResponse<{ session: AuthSession | null }>(response);
      return body.session;
    },
    async loginWithPassword(input: LoginInput) {
      const response = await fetch(`${config.baseUrl}/api/auth/sign-in/email`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      const body = await parseJsonResponse<{ session: AuthSession }>(response);
      return body.session;
    },
    async signupWithPassword(input: SignupInput) {
      const response = await fetch(`${config.baseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      const body = await parseJsonResponse<{ session: AuthSession }>(response);
      return body.session;
    },
    async logout() {
      const response = await fetch(`${config.baseUrl}/api/auth/sign-out`, {
        credentials: "include",
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`auth logout failed: ${String(response.status)}`);
      }
    },
    async listOrganizations() {
      const response = await fetch(`${config.baseUrl}/api/auth/organization/list`, {
        credentials: "include",
        method: "GET"
      });

      const body = await parseJsonResponse<{ organizations: AuthOrganization[] }>(response);
      return body.organizations;
    },
    async setActiveOrganization(organizationId: string) {
      const response = await fetch(`${config.baseUrl}/api/auth/organization/set-active`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ organizationId })
      });

      const body = await parseJsonResponse<{ session: AuthSession }>(response);
      return body.session;
    },
    async createOrganization(input: CreateOrganizationInput) {
      const response = await fetch(`${config.baseUrl}/api/auth/organization/create`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      const body = await parseJsonResponse<{ session: AuthSession }>(response);
      return body.session;
    }
  };
}
