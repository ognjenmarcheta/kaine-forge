import { createAuthTransport } from "@repo/auth/transport";
import type { AuthSocialProvider } from "@repo/auth/transport";

import { AUTH_CONFIG } from "../features/auth/auth.config";
import { AUTH_DEFINITION } from "../features/auth/auth.definition";
import type { AuthSession } from "../features/auth/auth.type";
import { getStoredSessionToken, setStoredSessionToken } from "../features/auth/auth.util";
import type {
  OrganizationMember,
  OrganizationOption
} from "../features/organizations/organizations.type";

export interface ListOrganizationsResponse {
  activeOrganizationId: string | null;
  organizations: OrganizationOption[];
}

export interface ListOrganizationMembersResponse {
  members: OrganizationMember[];
}

export const authTransport = createAuthTransport({
  adapter: {
    baseUrl: AUTH_CONFIG.baseUrl,
    credentials: "include",
    fetch,
    getSessionToken: () => getStoredSessionToken(AUTH_DEFINITION.tokenStorageKey),
    setSessionToken: (sessionToken) =>
      setStoredSessionToken(AUTH_DEFINITION.tokenStorageKey, sessionToken),
    socialCallbackUrl: typeof window === "undefined" ? undefined : window.location.origin
  }
});

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

// Two-factor and email one-time-code requests go straight to the transport;
// steps that create a session run through useAuth().completeSignIn.
export const twoFactorApi = {
  disable: (password: string) => authTransport.disableTwoFactor(password),
  enable: (password: string) => authTransport.enableTwoFactor(password),
  regenerateBackupCodes: (password: string) => authTransport.regenerateBackupCodes(password),
  sendOtp: () => authTransport.sendTwoFactorOtp(),
  verify: (input: Parameters<typeof authTransport.verifyTwoFactor>[0]) =>
    authTransport.verifyTwoFactor(input),
  verifyEnrollment: (code: string) => authTransport.verifyTotpEnrollment(code)
};

export const emailOtpApi = {
  requestPasswordReset: (input: { captchaToken?: string; email: string }) =>
    authTransport.requestPasswordResetOtp(input),
  resetPassword: (input: { email: string; otp: string; password: string }) =>
    authTransport.resetPasswordWithOtp(input),
  sendSignInCode: (input: { captchaToken?: string; email: string }) =>
    authTransport.sendSignInOtp(input),
  signIn: (input: { email: string; otp: string }) => authTransport.signInWithOtp(input)
};

export async function fetchSession(session: AuthSession | null): Promise<AuthSession | null> {
  void session;
  return authTransport.getSession();
}

export async function logoutRequest(session: AuthSession | null): Promise<void> {
  void session;
  await authTransport.logout();
}

export async function listOrganizationsRequest(): Promise<ListOrganizationsResponse> {
  return authTransport.listOrganizations();
}

export async function listOrganizationMembersRequest(): Promise<ListOrganizationMembersResponse> {
  return {
    members: await authTransport.listOrganizationMembers()
  };
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
