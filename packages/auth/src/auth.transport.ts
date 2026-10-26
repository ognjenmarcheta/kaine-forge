import { createAuthClient } from "better-auth/client";
import { emailOTPClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";

import type {
  AuthOrganizationMember,
  AuthOrganizationsResult,
  AuthSession,
  AuthSocialProvider,
  ClientAuth,
  CreateOrganizationInput,
  LoginInput,
  ResetPasswordWithEmailOtpInput,
  SendEmailOtpInput,
  SignInWithEmailOtpInput,
  SignupInput,
  TwoFactorEnrollment,
  TwoFactorMethod,
  VerifyTwoFactorInput
} from "./auth.type";
import { slugifyOrganizationName } from "./auth.util";

// Re-exported so bundler consumers that only alias the transport entry can
// reference the provider union without importing server-facing modules.
export type { AuthSocialProvider, TwoFactorEnrollment, TwoFactorMethod } from "./auth.type";

type MaybePromise<T> = Promise<T> | T;

type AuthFetch = (input: string, init: RequestInit) => Promise<Response>;
type AuthCredentials = "include" | "omit" | "same-origin";

// Maximum slug candidates tried when creating an organization before the
// wrapper gives up (mirrors the server-side personal-organization loop).
const CREATE_ORGANIZATION_SLUG_ATTEMPTS = 10;

const SOCIAL_PROVIDERS: readonly AuthSocialProvider[] = ["github", "google"];

// Response header set by better-auth's bearer plugin whenever a request
// created or refreshed a session; its value is the signed session token that
// non-cookie clients replay as `Authorization: Bearer <token>`.
const SESSION_TOKEN_HEADER = "set-auth-token";

// Request header the better-auth captcha plugin reads the Turnstile token from.
const CAPTCHA_RESPONSE_HEADER = "x-captcha-response";

/** Code on the AuthRequestError thrown when password sign-in needs a second factor. */
export const TWO_FACTOR_REQUIRED = "TWO_FACTOR_REQUIRED";

/**
 * A failed auth request. `code` is better-auth's machine-readable error code
 * (e.g. PASSWORD_COMPROMISED), so clients can show a precise message.
 */
export class AuthRequestError extends Error {
  readonly code: string | undefined;
  readonly status: number;
  readonly twoFactorMethods: readonly TwoFactorMethod[];

  constructor(input: {
    code?: string | undefined;
    status: number;
    twoFactorMethods?: readonly TwoFactorMethod[] | undefined;
  }) {
    super(`auth request failed (${String(input.status)})`);
    this.name = "AuthRequestError";
    this.code = input.code;
    this.status = input.status;
    this.twoFactorMethods = input.twoFactorMethods ?? [];
  }
}

export function isTwoFactorRequiredError(error: unknown): error is AuthRequestError {
  return error instanceof AuthRequestError && error.code === TWO_FACTOR_REQUIRED;
}

// i18n keys (packages/translation auth.json) for the better-auth error codes
// a user can act on; anything else falls back to the generic message.
const AUTH_ERROR_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  INVALID_EMAIL_OR_PASSWORD: "auth.error.invalidCredentials",
  USER_ALREADY_EXISTS: "auth.error.userExists",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "auth.error.userExists",
  PASSWORD_COMPROMISED: "auth.error.passwordCompromised",
  INVALID_OTP: "auth.error.invalidCode",
  INVALID_CODE: "auth.error.invalidCode",
  INVALID_BACKUP_CODE: "auth.error.invalidCode",
  OTP_EXPIRED: "auth.error.codeExpired",
  OTP_HAS_EXPIRED: "auth.error.codeExpired",
  TOO_MANY_ATTEMPTS: "auth.error.tooManyAttempts",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "auth.error.tooManyAttempts",
  ACCOUNT_TEMPORARILY_LOCKED: "auth.error.accountLocked",
  INVALID_TWO_FACTOR_COOKIE: "auth.error.twoFactorExpired",
  MISSING_RESPONSE: "auth.error.captcha",
  VERIFICATION_FAILED: "auth.error.captcha"
};

export function getAuthErrorMessageKey(error: unknown): string {
  const code = error instanceof AuthRequestError ? error.code : undefined;

  return (code && AUTH_ERROR_MESSAGE_KEYS[code]) ?? "error.generic";
}

function captchaFetchOptions(captchaToken: string | undefined) {
  return captchaToken ? { headers: { [CAPTCHA_RESPONSE_HEADER]: captchaToken } } : undefined;
}

export interface AuthTransportAdapter {
  baseUrl: string;
  credentials: AuthCredentials;
  fetch: AuthFetch;
  getSessionToken: () => MaybePromise<string | null>;
  setSessionToken: (sessionToken: string | null) => MaybePromise<void>;
  // Absolute URL the OAuth flow should land on after a social sign-in; when
  // omitted, better-auth falls back to the auth server's own origin.
  socialCallbackUrl?: string | undefined;
  /**
   * Extra better-auth client plugins (e.g. Expo `expoClient`).
   * Kept opaque so web never imports React Native / Expo modules.
   */
  clientPlugins?: readonly unknown[] | undefined;
}

export interface AuthTransport extends ClientAuth {
  listOrganizationMembers(): Promise<AuthOrganizationMember[]>;
  /** Completes a password sign-in that threw TWO_FACTOR_REQUIRED. */
  verifyTwoFactor(input: VerifyTwoFactorInput): Promise<AuthSession>;
  /** Emails a second-factor code during a pending two-factor sign-in. */
  sendTwoFactorOtp(): Promise<void>;
  /** Starts TOTP enrollment; 2FA turns on after verifyTotpEnrollment. */
  enableTwoFactor(password: string): Promise<TwoFactorEnrollment>;
  verifyTotpEnrollment(code: string): Promise<AuthSession>;
  disableTwoFactor(password: string): Promise<AuthSession>;
  regenerateBackupCodes(password: string): Promise<string[]>;
  sendSignInOtp(input: SendEmailOtpInput): Promise<void>;
  signInWithOtp(input: SignInWithEmailOtpInput): Promise<AuthSession>;
  requestPasswordResetOtp(input: SendEmailOtpInput): Promise<void>;
  resetPasswordWithOtp(input: ResetPasswordWithEmailOtpInput): Promise<void>;
}

interface CreateAuthTransportInput {
  adapter: AuthTransportAdapter;
}

// Parses a comma-separated provider list (e.g. "github,google") from a client
// env var into the known providers. Unknown entries are ignored; the server's
// provider gating stays authoritative — this only controls UI visibility.
export function parseSocialProviders(value: string | undefined): AuthSocialProvider[] {
  if (!value) {
    return [];
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return SOCIAL_PROVIDERS.filter((provider) => entries.includes(provider));
}

interface TransportRequestError {
  code?: string | undefined;
  message?: string | undefined;
  status: number;
}

function toAuthError(error: TransportRequestError): AuthRequestError {
  return new AuthRequestError({ code: error.code, status: error.status });
}

function isTwoFactorMethod(value: unknown): value is TwoFactorMethod {
  return value === "totp" || value === "otp";
}

// better-auth answers a password sign-in that needs a second factor with
// `{ twoFactorRedirect: true, twoFactorMethods }` and no session.
function readTwoFactorMethods(data: unknown): TwoFactorMethod[] | null {
  if (typeof data !== "object" || data === null || !("twoFactorRedirect" in data)) {
    return null;
  }

  if (data.twoFactorRedirect !== true) {
    return null;
  }

  const methods = "twoFactorMethods" in data ? data.twoFactorMethods : [];

  return Array.isArray(methods) ? methods.filter(isTwoFactorMethod) : [];
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isSlugConflict(error: TransportRequestError): boolean {
  return error.code === "ORGANIZATION_ALREADY_EXISTS";
}

export function createAuthTransport(input: CreateAuthTransportInput): AuthTransport {
  const adapter = input.adapter;
  const fetcher = adapter.fetch;

  // All better-auth requests funnel through this fetch wrapper so the bearer
  // seam stays in our code: replay the stored token on the way out, capture
  // the rotated token from `set-auth-token` on the way back.
  const bearerFetch: typeof fetch = async (requestInput, requestInit) => {
    const init: RequestInit = requestInit ?? {};
    const headers = new Headers(init.headers);
    const sessionToken = await adapter.getSessionToken();

    if (sessionToken && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${sessionToken}`);
    }

    const response = await fetcher(String(requestInput), {
      ...init,
      credentials: adapter.credentials,
      headers
    });
    const nextSessionToken = response.headers.get(SESSION_TOKEN_HEADER);

    if (nextSessionToken) {
      await adapter.setSessionToken(nextSessionToken);
    }

    return response;
  };

  // SAFETY: the adapter contract supplies better-auth client plugins in
  // clientPlugins; it stays typed as unknown so web bundles never import
  // Expo/React Native types, and `never[]` only re-widens it for `plugins`.
  const client = createAuthClient({
    baseURL: adapter.baseUrl || undefined,
    plugins: [
      organizationClient(),
      twoFactorClient(),
      emailOTPClient(),
      ...((adapter.clientPlugins ?? []) as never[])
    ],
    fetchOptions: {
      credentials: adapter.credentials,
      customFetchImpl: bearerFetch
    }
  });

  async function getSession(): Promise<AuthSession | null> {
    const { data, error } = await client.getSession();

    if (error) {
      throw toAuthError(error);
    }

    if (!data) {
      await adapter.setSessionToken(null);
      return null;
    }

    return {
      activeOrganizationId:
        typeof data.session.activeOrganizationId === "string"
          ? data.session.activeOrganizationId
          : null,
      expiresAt: toIsoString(data.session.expiresAt),
      user: {
        id: data.user.id,
        email: data.user.email,
        emailVerified: data.user.emailVerified,
        name: data.user.name,
        twoFactorEnabled: data.user.twoFactorEnabled === true
      }
    };
  }

  // Sign-in/up and organization mutations return protocol-specific payloads;
  // the stable AuthSession contract always comes from a follow-up session read.
  async function requireSession(): Promise<AuthSession> {
    const session = await getSession();

    if (!session) {
      throw new Error("auth session unavailable after auth request");
    }

    return session;
  }

  return {
    getSession,
    async loginWithPassword(loginInput: LoginInput) {
      const { data, error } = await client.signIn.email(
        {
          email: loginInput.email,
          password: loginInput.password
        },
        captchaFetchOptions(loginInput.captchaToken)
      );

      if (error) {
        throw toAuthError(error);
      }

      const twoFactorMethods = readTwoFactorMethods(data);

      if (twoFactorMethods) {
        // No session exists yet; the caller collects a code and calls
        // verifyTwoFactor (the pending state lives in a short-lived cookie).
        throw new AuthRequestError({ code: TWO_FACTOR_REQUIRED, status: 200, twoFactorMethods });
      }

      return requireSession();
    },
    async signupWithPassword(signupInput: SignupInput) {
      const { error } = await client.signUp.email(
        {
          email: signupInput.email,
          name: signupInput.name,
          password: signupInput.password
        },
        captchaFetchOptions(signupInput.captchaToken)
      );

      if (error) {
        throw toAuthError(error);
      }

      return requireSession();
    },
    async verifyTwoFactor(verifyInput: VerifyTwoFactorInput) {
      const body = { code: verifyInput.code, trustDevice: verifyInput.trustDevice };
      const { error } =
        verifyInput.method === "totp"
          ? await client.twoFactor.verifyTotp(body)
          : verifyInput.method === "otp"
            ? await client.twoFactor.verifyOtp(body)
            : await client.twoFactor.verifyBackupCode(body);

      if (error) {
        throw toAuthError(error);
      }

      return requireSession();
    },
    async sendTwoFactorOtp() {
      const { error } = await client.twoFactor.sendOtp();

      if (error) {
        throw toAuthError(error);
      }
    },
    async enableTwoFactor(password: string) {
      const { data, error } = await client.twoFactor.enable({ password });

      if (error) {
        throw toAuthError(error);
      }

      if (!data || !("totpURI" in data)) {
        throw new Error("two-factor enrollment returned no TOTP URI");
      }

      return { backupCodes: data.backupCodes, totpUri: data.totpURI };
    },
    async verifyTotpEnrollment(code: string) {
      const { error } = await client.twoFactor.verifyTotp({ code });

      if (error) {
        throw toAuthError(error);
      }

      return requireSession();
    },
    async disableTwoFactor(password: string) {
      const { error } = await client.twoFactor.disable({ password });

      if (error) {
        throw toAuthError(error);
      }

      return requireSession();
    },
    async regenerateBackupCodes(password: string) {
      const { data, error } = await client.twoFactor.generateBackupCodes({ password });

      if (error) {
        throw toAuthError(error);
      }

      return data?.backupCodes ?? [];
    },
    async sendSignInOtp(otpInput: SendEmailOtpInput) {
      const { error } = await client.emailOtp.sendVerificationOtp(
        { email: otpInput.email, type: "sign-in" },
        captchaFetchOptions(otpInput.captchaToken)
      );

      if (error) {
        throw toAuthError(error);
      }
    },
    async signInWithOtp(otpInput: SignInWithEmailOtpInput) {
      const { error } = await client.signIn.emailOtp({
        email: otpInput.email,
        otp: otpInput.otp
      });

      if (error) {
        throw toAuthError(error);
      }

      return requireSession();
    },
    async requestPasswordResetOtp(resetInput: SendEmailOtpInput) {
      const { error } = await client.emailOtp.requestPasswordReset(
        { email: resetInput.email },
        captchaFetchOptions(resetInput.captchaToken)
      );

      if (error) {
        throw toAuthError(error);
      }
    },
    async resetPasswordWithOtp(resetInput: ResetPasswordWithEmailOtpInput) {
      const { error } = await client.emailOtp.resetPassword({
        email: resetInput.email,
        otp: resetInput.otp,
        password: resetInput.password
      });

      if (error) {
        throw toAuthError(error);
      }
    },
    async signInWithSocial(provider: AuthSocialProvider) {
      // In browsers the vanilla client redirects to the provider via
      // window.location; in non-browser runtimes the call resolves without
      // navigating, so native apps need their own redirect handling.
      const { error } = await client.signIn.social({
        provider,
        ...(adapter.socialCallbackUrl ? { callbackURL: adapter.socialCallbackUrl } : {})
      });

      if (error) {
        throw toAuthError(error);
      }
    },
    async logout() {
      const { error } = await client.signOut();

      if (error) {
        throw toAuthError(error);
      }

      await adapter.setSessionToken(null);
    },
    async listOrganizations(): Promise<AuthOrganizationsResult> {
      const [organizationsResult, session] = await Promise.all([
        client.organization.list(),
        getSession()
      ]);

      if (organizationsResult.error) {
        throw toAuthError(organizationsResult.error);
      }

      return {
        activeOrganizationId: session?.activeOrganizationId ?? null,
        organizations: (organizationsResult.data ?? []).map((organization) => ({
          id: organization.id,
          name: organization.name,
          slug: organization.slug
        }))
      };
    },
    async listOrganizationMembers() {
      // Explicit page size; pagination is deliberately not surfaced at template scale.
      const { data, error } = await client.organization.listMembers({ query: { limit: 100 } });

      if (error) {
        throw toAuthError(error);
      }

      return (data?.members ?? []).map((member) => ({
        id: member.id,
        userId: member.userId,
        email: member.user.email,
        name: member.user.name,
        role: member.role
      }));
    },
    async setActiveOrganization(organizationId: string) {
      const { error } = await client.organization.setActive({ organizationId });

      if (error) {
        throw toAuthError(error);
      }

      return requireSession();
    },
    async createOrganization(createInput: CreateOrganizationInput) {
      // better-auth requires a globally unique slug the old protocol derived
      // server-side, so the wrapper retries suffixed candidates on conflict.
      const baseSlug = slugifyOrganizationName(createInput.name);

      for (let attempt = 0; attempt < CREATE_ORGANIZATION_SLUG_ATTEMPTS; attempt += 1) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${String(attempt + 1)}`;
        const { error } = await client.organization.create({
          name: createInput.name,
          slug
        });

        if (!error) {
          return requireSession();
        }

        if (!isSlugConflict(error)) {
          throw toAuthError(error);
        }
      }

      throw new Error("failed to create organization: slug conflicts exhausted");
    }
  };
}
