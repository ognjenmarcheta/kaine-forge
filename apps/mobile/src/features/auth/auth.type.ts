export interface AuthUser {
  email: string;
  emailVerified: boolean;
  id: string;
  name: string;
  twoFactorEnabled: boolean;
}

export interface AuthSession {
  expiresAt: string;
  activeOrganizationId: string | null;
  user: AuthUser;
}

export interface AuthContextValue {
  isLoading: boolean;
  login: (input: {
    captchaToken?: string | undefined;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  session: AuthSession | null;
  signup: (input: {
    captchaToken?: string | undefined;
    email: string;
    name: string;
    password: string;
  }) => Promise<void>;
}
