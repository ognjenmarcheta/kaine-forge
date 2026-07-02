import type { IncomingHttpHeaders } from "node:http";

import type { AuthenticatedOrganizationScope, OrganizationMembershipProof } from "./auth.scope";

export interface AuthConfig {
  baseUrl: string;
  secret: string;
}

export interface AuthClientConfig {
  baseUrl: string;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthSessionUser;
  expiresAt: string;
  activeOrganizationId: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  email: string;
  name: string;
  password: string;
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

export interface AuthOrganizationsResult {
  activeOrganizationId: string | null;
  organizations: AuthOrganization[];
}

export interface AuthSessionResult {
  session: AuthSession;
  sessionToken: string;
}

export interface ServerAuth {
  getSessionFromHeaders(headers: Headers | IncomingHttpHeaders): Promise<AuthSession | null>;
  loginWithPassword(input: LoginInput): Promise<AuthSessionResult>;
  signUpWithPassword(input: SignupInput): Promise<AuthSessionResult>;
  logout(sessionToken: string | null): Promise<void>;
  listOrganizationsByScope(scope: AuthenticatedOrganizationScope): Promise<AuthOrganization[]>;
  getCurrentOrganizationByScope(
    scope: AuthenticatedOrganizationScope
  ): Promise<AuthOrganization | null>;
  getOrganizationMembershipProof(params: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMembershipProof | null>;
  setActiveOrganization(params: {
    organizationId: string;
    sessionToken: string | null;
    userId: string;
  }): Promise<AuthSession>;
  createOrganization(params: {
    name: string;
    sessionToken: string | null;
    userId: string;
  }): Promise<AuthSession>;
  listOrganizationMembersByScope(
    scope: AuthenticatedOrganizationScope
  ): Promise<AuthOrganizationMember[]>;
  createInvitation(params: {
    email: string;
    role: string;
    scope: AuthenticatedOrganizationScope;
  }): Promise<AuthInvitation>;
  listInvitationsByScope(scope: AuthenticatedOrganizationScope): Promise<AuthInvitation[]>;
  acceptInvitation(params: { invitationId: string; user: AuthSessionUser }): Promise<void>;
  revokeInvitation(params: {
    invitationId: string;
    scope: AuthenticatedOrganizationScope;
  }): Promise<void>;
  requestPasswordReset(input: { email: string }): Promise<void>;
  resetPassword(input: { password: string; token: string }): Promise<void>;
}

export interface ClientAuth {
  getSession(): Promise<AuthSession | null>;
  loginWithPassword(input: LoginInput): Promise<AuthSession>;
  signupWithPassword(input: SignupInput): Promise<AuthSession>;
  logout(): Promise<void>;
  listOrganizations(): Promise<AuthOrganizationsResult>;
  setActiveOrganization(organizationId: string): Promise<AuthSession>;
  createOrganization(input: CreateOrganizationInput): Promise<AuthSession>;
}
