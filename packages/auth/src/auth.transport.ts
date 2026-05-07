import type {
  AuthOrganizationMember,
  AuthOrganizationsResult,
  AuthSession,
  ClientAuth,
  CreateOrganizationInput,
  LoginInput,
  SignupInput
} from "./auth.type";

type MaybePromise<T> = Promise<T> | T;

type AuthFetch = (input: string, init: RequestInit) => Promise<Response>;
type AuthCredentials = "include" | "omit" | "same-origin";

interface AuthRouteConfig {
  createOrganization: string;
  listOrganizations: string;
  listOrganizationMembers: string;
  login: string;
  logout: string;
  session: string;
  setActiveOrganization: string;
  signup: string;
}

export interface AuthTransportAdapter {
  baseUrl: string;
  credentials: AuthCredentials;
  fetch: AuthFetch;
  getSessionToken: () => MaybePromise<string | null>;
  setSessionToken: (sessionToken: string | null) => MaybePromise<void>;
}

export interface AuthTransport extends ClientAuth {
  listOrganizationMembers(): Promise<AuthOrganizationMember[]>;
}

interface CreateAuthTransportInput {
  adapter: AuthTransportAdapter;
  routes?: Partial<AuthRouteConfig>;
}

const DEFAULT_AUTH_ROUTES: AuthRouteConfig = {
  createOrganization: "/api/auth/organization/create",
  listOrganizations: "/api/auth/organization/list",
  listOrganizationMembers: "/api/auth/organization/get-members",
  login: "/api/auth/sign-in/email",
  logout: "/api/auth/sign-out",
  session: "/api/auth/get-session",
  setActiveOrganization: "/api/auth/organization/set-active",
  signup: "/api/auth/sign-up/email"
};

function buildUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function jsonHeaders(sessionToken: string | null): Record<string, string> {
  return {
    ...sessionHeaders(sessionToken),
    "content-type": "application/json"
  };
}

function sessionHeaders(sessionToken: string | null): Record<string, string> {
  if (!sessionToken) {
    return {};
  }

  return {
    authorization: `Bearer ${sessionToken}`
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`auth request failed (${String(response.status)})`);
  }

  return (await response.json()) as T;
}

async function syncSessionToken(
  adapter: AuthTransportAdapter,
  sessionToken: string | null | undefined
): Promise<void> {
  await adapter.setSessionToken(typeof sessionToken === "string" ? sessionToken : null);
}

export function createAuthTransport(input: CreateAuthTransportInput): AuthTransport {
  const adapter = input.adapter;
  const fetcher = adapter.fetch;
  const routes = {
    ...DEFAULT_AUTH_ROUTES,
    ...input.routes
  };

  async function request<T>(path: string, init: Omit<RequestInit, "credentials">): Promise<T> {
    return parseJson<T>(
      await fetcher(buildUrl(adapter.baseUrl, path), {
        ...init,
        credentials: adapter.credentials
      })
    );
  }

  return {
    async getSession() {
      const sessionToken = await adapter.getSessionToken();
      const response = await fetcher(buildUrl(adapter.baseUrl, routes.session), {
        credentials: adapter.credentials,
        headers: sessionHeaders(sessionToken),
        method: "GET"
      });

      if (response.status === 204) {
        await adapter.setSessionToken(null);
        return null;
      }

      const body = await parseJson<{ session: AuthSession | null; sessionToken?: string }>(
        response
      );
      await syncSessionToken(adapter, body.sessionToken);
      return body.session;
    },
    async loginWithPassword(input: LoginInput) {
      const body = await request<{ session: AuthSession; sessionToken?: string }>(routes.login, {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      await syncSessionToken(adapter, body.sessionToken);
      return body.session;
    },
    async signupWithPassword(input: SignupInput) {
      const body = await request<{ session: AuthSession; sessionToken?: string }>(routes.signup, {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      await syncSessionToken(adapter, body.sessionToken);
      return body.session;
    },
    async logout() {
      const sessionToken = await adapter.getSessionToken();
      const response = await fetcher(buildUrl(adapter.baseUrl, routes.logout), {
        credentials: adapter.credentials,
        headers: sessionHeaders(sessionToken),
        method: "POST"
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`auth request failed (${String(response.status)})`);
      }

      await adapter.setSessionToken(null);
    },
    async listOrganizations() {
      return request<AuthOrganizationsResult>(routes.listOrganizations, {
        headers: sessionHeaders(await adapter.getSessionToken()),
        method: "GET"
      });
    },
    async listOrganizationMembers() {
      const body = await request<{ members: AuthOrganizationMember[] }>(
        routes.listOrganizationMembers,
        {
          headers: sessionHeaders(await adapter.getSessionToken()),
          method: "GET"
        }
      );
      return body.members;
    },
    async setActiveOrganization(organizationId: string) {
      const body = await request<{ session: AuthSession }>(routes.setActiveOrganization, {
        body: JSON.stringify({ organizationId }),
        headers: jsonHeaders(await adapter.getSessionToken()),
        method: "POST"
      });
      return body.session;
    },
    async createOrganization(input: CreateOrganizationInput) {
      const body = await request<{ session: AuthSession }>(routes.createOrganization, {
        body: JSON.stringify(input),
        headers: jsonHeaders(await adapter.getSessionToken()),
        method: "POST"
      });
      return body.session;
    }
  };
}
