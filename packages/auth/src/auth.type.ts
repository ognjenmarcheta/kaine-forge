import type { IncomingHttpHeaders } from "node:http";

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

export interface AuthSessionResult {
  session: AuthSession;
  sessionToken: string;
}

export interface ServerAuth {
  getSessionFromHeaders(headers: Headers | IncomingHttpHeaders): Promise<AuthSession | null>;
  loginWithPassword(input: LoginInput): Promise<AuthSessionResult>;
  signUpWithPassword(input: SignupInput): Promise<AuthSessionResult>;
  logout(sessionToken: string | null): Promise<void>;
  listOrganizations(userId: string): Promise<AuthOrganization[]>;
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
  getMembers(params: { organizationId: string; userId: string }): Promise<AuthOrganizationMember[]>;
}

export interface ClientAuth {
  getSession(): Promise<AuthSession | null>;
  loginWithPassword(input: LoginInput): Promise<AuthSession>;
  signupWithPassword(input: SignupInput): Promise<AuthSession>;
  logout(): Promise<void>;
  listOrganizations(): Promise<AuthOrganization[]>;
  setActiveOrganization(organizationId: string): Promise<AuthSession>;
  createOrganization(input: CreateOrganizationInput): Promise<AuthSession>;
}
