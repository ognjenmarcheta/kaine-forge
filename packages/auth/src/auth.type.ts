import type { IncomingHttpHeaders } from "node:http";

import type { Permission } from "./auth.permissions";
import type { AuthenticatedOrganizationScope, OrganizationMembershipProof } from "./auth.scope";

export interface AuthConfig {
  baseUrl: string;
  requireEmailVerification: boolean;
  secret: string;
  // Origin of the web app, for links in emails (BETTER_AUTH_URL is the API).
  webAppUrl: string;
}

export interface AuthClientConfig {
  baseUrl: string;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  twoFactorEnabled: boolean;
  /**
   * False until the user finishes or skips the web first-run onboarding. The
   * client transport sets it; server session reads leave it out.
   */
  onboardingCompleted?: boolean;
}

export interface AuthSession {
  user: AuthSessionUser;
  expiresAt: string;
  activeOrganizationId: string | null;
}

// Turnstile token for captcha-protected endpoints; omitted when the client
// renders no captcha (server captcha off).
interface CaptchaInput {
  captchaToken?: string | undefined;
}

export interface LoginInput extends CaptchaInput {
  email: string;
  password: string;
}

export interface SignupInput extends CaptchaInput {
  email: string;
  name: string;
  password: string;
  /** Language of the user's emails; the server accepts en, sr, or de. */
  locale?: string | undefined;
}

export type TwoFactorMethod = "totp" | "otp";

export interface VerifyTwoFactorInput {
  // "backup" verifies a one-time backup code instead of a TOTP or email code.
  method: TwoFactorMethod | "backup";
  code: string;
  trustDevice: boolean;
}

export interface SendEmailOtpInput extends CaptchaInput {
  email: string;
}

export interface SendMagicLinkInput extends CaptchaInput {
  email: string;
  /** Absolute web URL the link opens signed in. */
  callbackUrl: string;
  /** Absolute web URL a used or expired link opens; better-auth adds `error`. */
  errorCallbackUrl: string;
}

export interface SignInWithEmailOtpInput {
  email: string;
  otp: string;
}

export interface ResetPasswordWithEmailOtpInput {
  email: string;
  otp: string;
  password: string;
}

export interface TwoFactorEnrollment {
  backupCodes: string[];
  totpUri: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  /** Signs out every other session; this device gets a new session. */
  revokeOtherSessions: boolean;
}

export interface ChangeEmailInput {
  newEmail: string;
  /** Absolute URL the verification link returns to. */
  callbackUrl?: string | undefined;
}

/** One signed-in device of the session user. */
export interface AuthDeviceSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  /** The session making this request. */
  current: boolean;
}

/** A passkey of the signed-in user. */
export interface AuthPasskey {
  id: string;
  name: string | null;
  createdAt: string;
}

/** A sign-in method linked to the user: "credential" (password) or a social provider id. */
export interface AuthLinkedAccount {
  id: string;
  providerId: string;
  createdAt: string;
}

export interface CreateOrganizationInput {
  name: string;
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface AuthOrganizationMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
}

export interface InviteMemberInput {
  email: string;
  /** admin, member, or a Custom Role name; the owner role moves only through a transfer. */
  role: string;
}

/** A Custom Role of the Active Organization: a name plus the Permissions it grants. */
export interface AuthCustomRole {
  id: string;
  name: string;
  permissions: Permission[];
}

export interface CustomRoleInput {
  name: string;
  permissions: readonly Permission[];
}

// What the invited person sees before accepting or declining.
export interface AuthInvitationDetails {
  id: string;
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
}

// better-auth's client-side organization list has no per-membership role, so
// the client result carries the role-less organization shape while the server
// facade keeps returning AuthOrganization (with role) for GraphQL resolvers.
export type AuthClientOrganization = Omit<AuthOrganization, "role"> & {
  // A Personal Organization cannot be deleted, left, or handed over.
  personal: boolean;
};

export interface AuthOrganizationsResult {
  activeOrganizationId: string | null;
  organizations: AuthClientOrganization[];
}

export type AuthSocialProvider = "github" | "google";

// Auth writes (sign-in/up/out, organization and invitation mutations, password
// reset, email verification) go through better-auth's /api/auth handler; the
// server facade only covers session resolution and organization-scoped reads
// consumed by the GraphQL context and resolvers.
export interface CreateApiKeyInput {
  name: string;
  /** Null for a key that never expires. */
  expiresInDays: number | null;
}

/** A new API Key; `key` is the plain key, returned once and stored nowhere. */
export interface CreatedApiKey {
  id: string;
  key: string;
  name: string;
}

export interface ServerAuth {
  getSessionFromHeaders(headers: Headers | IncomingHttpHeaders): Promise<AuthSession | null>;
  /** The scope an `x-api-key` request acts in; null for an unknown, revoked, or expired key. */
  resolveApiKey(
    key: string
  ): Promise<{ apiKeyId: string; scope: AuthenticatedOrganizationScope } | null>;
  createApiKey(
    scope: AuthenticatedOrganizationScope,
    input: CreateApiKeyInput
  ): Promise<CreatedApiKey>;
  listOrganizationsByScope(scope: AuthenticatedOrganizationScope): Promise<AuthOrganization[]>;
  getCurrentOrganizationByScope(
    scope: AuthenticatedOrganizationScope
  ): Promise<AuthOrganization | null>;
  getOrganizationMembershipProof(params: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMembershipProof | null>;
  listOrganizationMembersByScope(
    scope: AuthenticatedOrganizationScope
  ): Promise<AuthOrganizationMember[]>;
  listInvitationsByScope(scope: AuthenticatedOrganizationScope): Promise<AuthInvitation[]>;
}

export interface ClientAuth {
  getSession(): Promise<AuthSession | null>;
  loginWithPassword(input: LoginInput): Promise<AuthSession>;
  signupWithPassword(input: SignupInput): Promise<AuthSession>;
  signInWithSocial(provider: AuthSocialProvider): Promise<void>;
  logout(): Promise<void>;
  listOrganizations(): Promise<AuthOrganizationsResult>;
  setActiveOrganization(organizationId: string): Promise<AuthSession>;
  createOrganization(input: CreateOrganizationInput): Promise<AuthSession>;
}
