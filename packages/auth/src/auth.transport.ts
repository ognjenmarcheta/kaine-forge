import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

import type {
  AuthOrganizationMember,
  AuthOrganizationsResult,
  AuthSession,
  AuthSocialProvider,
  ClientAuth,
  CreateOrganizationInput,
  LoginInput,
  SignupInput
} from "./auth.type";
import { slugifyOrganizationName } from "./auth.util";

// Re-exported so bundler consumers that only alias the transport entry can
// reference the provider union without importing server-facing modules.
export type { AuthSocialProvider } from "./auth.type";

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

function toAuthError(error: TransportRequestError): Error {
  return new Error(`auth request failed (${String(error.status)})`);
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

  const client = createAuthClient({
    baseURL: adapter.baseUrl || undefined,
    plugins: [organizationClient(), ...((adapter.clientPlugins ?? []) as never[])],
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
        name: data.user.name
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
      const { error } = await client.signIn.email({
        email: loginInput.email,
        password: loginInput.password
      });

      if (error) {
        throw toAuthError(error);
      }

      return requireSession();
    },
    async signupWithPassword(signupInput: SignupInput) {
      const { error } = await client.signUp.email({
        email: signupInput.email,
        name: signupInput.name,
        password: signupInput.password
      });

      if (error) {
        throw toAuthError(error);
      }

      return requireSession();
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
