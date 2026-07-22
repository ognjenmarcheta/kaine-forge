import { expoClient } from "@better-auth/expo/client";
import { createAuthTransport } from "@repo/auth/transport";
import type { AuthSocialProvider } from "@repo/auth/transport";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";

import { AUTH_CONFIG } from "../features/auth/auth.config";
import { AUTH_DEFINITION } from "../features/auth/auth.definition";
import type { AuthSession } from "../features/auth/auth.type";
import { getStoredSessionToken, setStoredSessionToken } from "../features/auth/auth.util";

export interface OrganizationOption {
  id: string;
  name: string;
  role?: string;
  slug?: string;
}

export interface ListOrganizationsResponse {
  activeOrganizationId: string | null;
  organizations: OrganizationOption[];
}

export const authTransport = createAuthTransport({
  adapter: {
    baseUrl: AUTH_CONFIG.baseUrl,
    // Expo client plugin manages cookie storage; bearer header still used via
    // our get/setSessionToken bridge for GraphQL and non-cookie surfaces.
    credentials: "omit",
    fetch,
    getSessionToken: () => getStoredSessionToken(AUTH_DEFINITION.tokenStorageKey),
    setSessionToken: (sessionToken) =>
      setStoredSessionToken(AUTH_DEFINITION.tokenStorageKey, sessionToken),
    socialCallbackUrl: Linking.createURL("/"),
    clientPlugins: [
      expoClient({
        scheme: AUTH_CONFIG.scheme,
        storagePrefix: "kaine",
        // Matches server advanced.cookiePrefix ("kaine").
        cookiePrefix: "kaine",
        storage: SecureStore
      })
    ]
  }
});

export async function fetchSession(session: AuthSession | null): Promise<AuthSession | null> {
  void session;
  return authTransport.getSession();
}

export async function loginRequest(input: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  return authTransport.loginWithPassword(input);
}

export async function signupRequest(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AuthSession> {
  return authTransport.signupWithPassword(input);
}

export async function logoutRequest(session: AuthSession | null): Promise<void> {
  void session;
  await authTransport.logout();
}

export async function listOrganizationsRequest(): Promise<ListOrganizationsResponse> {
  return authTransport.listOrganizations();
}

export async function setActiveOrganizationRequest(organizationId: string): Promise<AuthSession> {
  return authTransport.setActiveOrganization(organizationId);
}

export async function createOrganizationRequest(name: string): Promise<AuthSession> {
  return authTransport.createOrganization({ name });
}

export async function signInWithSocialRequest(provider: AuthSocialProvider): Promise<void> {
  await authTransport.signInWithSocial(provider);
}
