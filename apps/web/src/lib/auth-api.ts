import { AUTH_CONFIG } from "../features/auth/auth.config";
import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";
import type { OrganizationOption } from "../features/organizations/organizations.util";

export interface ListOrganizationsResponse {
  activeOrganizationId: string | null;
  organizations: OrganizationOption[];
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`auth request failed (${String(response.status)})`);
  }

  return (await response.json()) as T;
}

export async function loginRequest(input: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  const response = await fetch(AUTH_CONFIG.routes.login, {
    body: JSON.stringify(input),
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  const body = await parseJson<{ session: AuthSession }>(response);
  return body.session;
}

export async function signupRequest(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AuthSession> {
  const response = await fetch(AUTH_CONFIG.routes.signup, {
    body: JSON.stringify(input),
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  const body = await parseJson<{ session: AuthSession }>(response);
  return body.session;
}

export async function fetchSession(session: AuthSession | null): Promise<AuthSession | null> {
  const response = await fetch(AUTH_CONFIG.routes.session, {
    credentials: "include",
    headers: authHeaders(session),
    method: "GET"
  });

  if (response.status === 204) {
    return null;
  }

  const body = await parseJson<{ session: AuthSession | null }>(response);
  return body.session;
}

export async function logoutRequest(session: AuthSession | null): Promise<void> {
  const response = await fetch(AUTH_CONFIG.routes.logout, {
    credentials: "include",
    headers: authHeaders(session),
    method: "POST"
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`auth request failed (${String(response.status)})`);
  }
}

export async function listOrganizationsRequest(): Promise<ListOrganizationsResponse> {
  const response = await fetch(AUTH_CONFIG.routes.organizationList, {
    credentials: "include",
    method: "GET"
  });

  return parseJson<ListOrganizationsResponse>(response);
}

export async function setActiveOrganizationRequest(organizationId: string): Promise<AuthSession> {
  const response = await fetch(AUTH_CONFIG.routes.setActiveOrganization, {
    body: JSON.stringify({ organizationId }),
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  const body = await parseJson<{ session: AuthSession }>(response);
  return body.session;
}

export async function createOrganizationRequest(name: string): Promise<AuthSession> {
  const response = await fetch(AUTH_CONFIG.routes.createOrganization, {
    body: JSON.stringify({ name }),
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  const body = await parseJson<{ session: AuthSession }>(response);
  return body.session;
}
