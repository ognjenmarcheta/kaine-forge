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

// Organization management acts on the Active Organization; the server resolves
// it from the session, so no request carries an organization id.
export const organizationApi = {
  acceptInvitation: (invitationId: string) => authTransport.acceptInvitation(invitationId),
  cancelInvitation: (invitationId: string) => authTransport.cancelInvitation(invitationId),
  deleteOrganization: () => authTransport.deleteOrganization(),
  getInvitation: (invitationId: string) => authTransport.getInvitation(invitationId),
  listCustomRoles: () => authTransport.listCustomRoles(),
  createCustomRole: (input: Parameters<typeof authTransport.createCustomRole>[0]) =>
    authTransport.createCustomRole(input),
  updateCustomRole: (input: Parameters<typeof authTransport.updateCustomRole>[0]) =>
    authTransport.updateCustomRole(input),
  deleteCustomRole: (name: string) => authTransport.deleteCustomRole(name),
  inviteMember: (input: Parameters<typeof authTransport.inviteMember>[0]) =>
    authTransport.inviteMember(input),
  leaveOrganization: () => authTransport.leaveOrganization(),
  listInvitations: () => authTransport.listInvitations(),
  rejectInvitation: (invitationId: string) => authTransport.rejectInvitation(invitationId),
  removeMember: (memberId: string) => authTransport.removeMember(memberId),
  renameOrganization: (name: string) => authTransport.renameOrganization(name),
  transferOwnership: (memberId: string) => authTransport.transferOwnership(memberId),
  updateMemberRole: (input: Parameters<typeof authTransport.updateMemberRole>[0]) =>
    authTransport.updateMemberRole(input)
};

// Ends the first-run onboarding for the session user (finish or skip).
export const onboardingApi = {
  complete: () => authTransport.completeOnboarding()
};

// The account page sends links back to itself after a verification or a
// provider sign-in.
function accountPageUrl(): string | undefined {
  return typeof window === "undefined" ? undefined : `${window.location.origin}/account`;
}

// Account settings of the session user; nothing here takes a user id.
export const accountApi = {
  changeEmail: (newEmail: string) =>
    authTransport.changeEmail({ newEmail, callbackUrl: accountPageUrl() }),
  changePassword: (input: Parameters<typeof authTransport.changePassword>[0]) =>
    authTransport.changePassword(input),
  confirmDeletion: (token: string) => authTransport.confirmAccountDeletion(token),
  linkSocialAccount: (provider: AuthSocialProvider) =>
    authTransport.linkSocialAccount({ provider, callbackUrl: accountPageUrl() }),
  listAccounts: () => authTransport.listAccounts(),
  listSessions: () => authTransport.listSessions(),
  listSocialProviders: () => authTransport.listSocialProviders(),
  requestDeletion: () => authTransport.requestAccountDeletion(),
  revokeOtherSessions: () => authTransport.revokeOtherSessions(),
  revokeSession: (sessionId: string) => authTransport.revokeSession(sessionId),
  unlinkAccount: (accountId: string) => authTransport.unlinkAccount(accountId),
  updateName: (name: string) => authTransport.updateProfile({ name })
};

// The emailed link opens the API, which signs in and redirects back here: to
// the return path, or to the sign-in page with an `error` when the link is
// used or expired.
export const magicLinkApi = {
  send: (input: { captchaToken?: string; email: string; returnPath: string }) =>
    authTransport.sendMagicLink({
      email: input.email,
      callbackUrl: new URL(input.returnPath, window.location.origin).toString(),
      errorCallbackUrl: new URL(
        `/auth?${AUTH_DEFINITION.magicLinkErrorParam}=1`,
        window.location.origin
      ).toString(),
      ...(input.captchaToken ? { captchaToken: input.captchaToken } : {})
    })
};

// Passkeys of the session user; sign-in runs through useAuth().completeSignIn.
export const passkeyApi = {
  add: (name: string) => authTransport.addPasskey(name),
  delete: (passkeyId: string) => authTransport.deletePasskey(passkeyId),
  list: () => authTransport.listPasskeys(),
  signIn: () => authTransport.signInWithPasskey()
};

// Auth emails use the language stored on the user; the browser keeps its own
// copy for the UI.
export async function saveEmailLanguageRequest(language: string): Promise<void> {
  return authTransport.updateEmailLanguage(language);
}

export async function signInWithSocialRequest(provider: AuthSocialProvider): Promise<void> {
  await authTransport.signInWithSocial(provider);
}
