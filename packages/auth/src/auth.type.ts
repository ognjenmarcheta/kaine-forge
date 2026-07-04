import type { IncomingHttpHeaders } from "node:http";

import type { AuthenticatedOrganizationScope, OrganizationMembershipProof } from "./auth.scope";

export interface AuthConfig {
  baseUrl: string;
  requireEmailVerification: boolean;
  secret: string;
}

export interface AuthClientConfig {
  baseUrl: string;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
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

// better-auth's client-side organization list has no per-membership role, so
// the client result carries the role-less organization shape while the server
// facade keeps returning AuthOrganization (with role) for GraphQL resolvers.
export type AuthClientOrganization = Omit<AuthOrganization, "role">;

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
