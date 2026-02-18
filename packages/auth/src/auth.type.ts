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
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ServerAuth {
  getSessionFromHeaders(headers: Headers | IncomingHttpHeaders): Promise<AuthSession | null>;
  loginWithPassword(input: LoginInput): Promise<AuthSession>;
  logout(): Promise<void>;
}

export interface ClientAuth {
  getSession(): Promise<AuthSession | null>;
  loginWithPassword(input: LoginInput): Promise<AuthSession>;
  logout(): Promise<void>;
}
