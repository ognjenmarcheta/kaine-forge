import type { IncomingHttpHeaders } from "node:http";

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

// Roles an owner or admin may give through an invite or a role change; the
// owner role moves only through a transfer of ownership.
export type AssignableOrganizationRole = "admin" | "member";

export interface InviteMemberInput {
  email: string;
  role: AssignableOrganizationRole;
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
export interface ServerAuth {
  getSessionFromHeaders(headers: Headers | IncomingHttpHeaders): Promise<AuthSession | null>;
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
