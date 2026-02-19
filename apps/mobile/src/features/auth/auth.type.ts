export interface AuthUser {
  email: string;
  id: string;
  name: string;
}

export interface AuthSession {
  expiresAt: string;
  activeOrganizationId: string | null;
  user: AuthUser;
}

export interface AuthContextValue {
  isLoading: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  session: AuthSession | null;
  signup: (input: { email: string; name: string; password: string }) => Promise<void>;
}
