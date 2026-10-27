export interface AuthUser {
  email: string;
  emailVerified: boolean;
  id: string;
  name: string;
  twoFactorEnabled: boolean;
  // False until the first-run onboarding ends; unset means nothing to show.
  onboardingCompleted?: boolean;
}

export interface AuthSession {
  expiresAt: string;
  activeOrganizationId: string | null;
  user: AuthUser;
}

export interface AuthContextValue {
  /** Applies the session from a two-factor or email-code sign-in step. */
  completeSignIn: (signIn: () => Promise<AuthSession>) => Promise<void>;
  isLoading: boolean;
  // Throws an AuthRequestError with code TWO_FACTOR_REQUIRED when the account
  // needs a second factor (isTwoFactorRequiredError from @repo/auth/transport).
  login: (input: {
    captchaToken?: string | undefined;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the session, e.g. after two-factor settings change. */
  refreshSession: () => Promise<void>;
  session: AuthSession | null;
  signup: (input: {
    captchaToken?: string | undefined;
    email: string;
    locale?: string | undefined;
    name: string;
    password: string;
  }) => Promise<void>;
}
