import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthTransport, parseSocialProviders } from "./auth.transport";
import type { AuthTransportAdapter } from "./auth.transport";
import type { AuthSession } from "./auth.type";

const { createAuthClientMock, organizationClientMock } = vi.hoisted(() => ({
  createAuthClientMock: vi.fn(),
  organizationClientMock: vi.fn(() => ({ id: "organization" }))
}));

vi.mock("better-auth/client", () => ({
  createAuthClient: createAuthClientMock
}));

vi.mock("better-auth/client/plugins", () => ({
  organizationClient: organizationClientMock
}));

interface StubError {
  code?: string;
  message?: string;
  status: number;
  statusText?: string;
}

interface StubResult<T> {
  data: T | null;
  error: StubError | null;
}

interface SessionData {
  session: {
    activeOrganizationId?: string | null;
    expiresAt: Date | string;
  };
  user: {
    email: string;
    emailVerified: boolean;
    id: string;
    name: string;
  };
}

interface MemberData {
  id: string;
  role: string;
  user: { email: string; id: string; name: string };
  userId: string;
}

function sessionPayload(activeOrganizationId: string | null = "org-1"): StubResult<SessionData> {
  return {
    data: {
      session: {
        activeOrganizationId,
        expiresAt: "2026-01-01T00:00:00.000Z"
      },
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: false,
        name: "User"
      }
    },
    error: null
  };
}

function expectedSession(activeOrganizationId: string | null = "org-1"): AuthSession {
  return {
    activeOrganizationId,
    expiresAt: "2026-01-01T00:00:00.000Z",
    user: {
      id: "user-1",
      email: "user@example.com",
      emailVerified: false,
      name: "User"
    }
  };
}

function stubResult<T>(data: T): StubResult<T> {
  return { data, error: null };
}

function createClientStub() {
  return {
    getSession: vi.fn(async () => sessionPayload()),
    signIn: {
      email: vi.fn(async () => stubResult<Record<string, unknown>>({})),
      social: vi.fn(async () => stubResult({ url: "https://provider.example.test" }))
    },
    signUp: {
      email: vi.fn(async () => stubResult<Record<string, unknown>>({}))
    },
    signOut: vi.fn(async () => stubResult({ success: true })),
    organization: {
      list: vi.fn(async () =>
        stubResult<{ createdAt?: string; id: string; name: string; slug: string }[]>([])
      ),
      listMembers: vi.fn(async () => stubResult({ members: [] as MemberData[], total: 0 })),
      setActive: vi.fn(async () => stubResult<Record<string, unknown>>({})),
      create: vi.fn(async () => stubResult<Record<string, unknown>>({ id: "org-2" }))
    }
  };
}

function createAdapter(overrides: Partial<AuthTransportAdapter> = {}): AuthTransportAdapter {
  return {
    baseUrl: "https://api.example.test",
    credentials: "include",
    fetch: vi.fn(async () => new Response(null, { status: 200 })),
    getSessionToken: vi.fn(() => null),
    setSessionToken: vi.fn(() => undefined),
    ...overrides
  };
}

beforeEach(() => {
  createAuthClientMock.mockReset();
});

describe("createAuthTransport", () => {
  it("configures the better-auth client with the adapter base url and organization plugin", () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    createAuthTransport({ adapter: createAdapter() });

    expect(createAuthClientMock).toHaveBeenCalledTimes(1);
    const options = createAuthClientMock.mock.calls[0]?.[0] as {
      baseURL?: string;
      fetchOptions: { credentials: string };
      plugins: unknown[];
    };
    expect(options.baseURL).toBe("https://api.example.test");
    expect(options.plugins).toEqual([{ id: "organization" }]);
    expect(options.fetchOptions.credentials).toBe("include");
  });

  it("forwards optional client plugins (e.g. Expo) after organizationClient", () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);
    const expoPlugin = { id: "expo-client" };

    createAuthTransport({
      adapter: createAdapter({ clientPlugins: [expoPlugin] })
    });

    const options = createAuthClientMock.mock.calls[0]?.[0] as {
      plugins: unknown[];
    };
    expect(options.plugins).toEqual([{ id: "organization" }, expoPlugin]);
  });

  it("maps the better-auth session payload to AuthSession", async () => {
    const client = createClientStub();
    client.getSession.mockResolvedValue({
      data: {
        session: {
          activeOrganizationId: "org-9",
          expiresAt: new Date("2026-02-01T00:00:00.000Z")
        },
        user: {
          id: "user-1",
          email: "user@example.com",
          emailVerified: true,
          name: "User"
        }
      },
      error: null
    });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.getSession()).resolves.toEqual({
      activeOrganizationId: "org-9",
      expiresAt: "2026-02-01T00:00:00.000Z",
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: true,
        name: "User"
      }
    });
  });

  it("returns null and clears the stored token when no session exists", async () => {
    const client = createClientStub();
    client.getSession.mockResolvedValue({ data: null, error: null });
    createAuthClientMock.mockReturnValue(client);
    const setSessionToken = vi.fn(() => undefined);

    const transport = createAuthTransport({ adapter: createAdapter({ setSessionToken }) });

    await expect(transport.getSession()).resolves.toBeNull();
    expect(setSessionToken).toHaveBeenCalledWith(null);
  });

  it("signs in with email and returns the refreshed session", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(
      transport.loginWithPassword({ email: "user@example.com", password: "secret" })
    ).resolves.toEqual(expectedSession());
    expect(client.signIn.email).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret"
    });
  });

  it("signs up with email and returns the refreshed session", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(
      transport.signupWithPassword({
        email: "user@example.com",
        name: "User",
        password: "secret"
      })
    ).resolves.toEqual(expectedSession());
    expect(client.signUp.email).toHaveBeenCalledWith({
      email: "user@example.com",
      name: "User",
      password: "secret"
    });
  });

  it("throws a stable auth request error for failed requests", async () => {
    const client = createClientStub();
    client.signIn.email.mockResolvedValue({
      data: null,
      error: { status: 401, statusText: "Unauthorized" }
    });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(
      transport.loginWithPassword({ email: "user@example.com", password: "wrong" })
    ).rejects.toThrow("auth request failed (401)");
  });

  it("captures rotated bearer tokens and replays them on later requests", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);
    let storedToken: string | null = null;
    const fetcher = vi.fn(async () =>
      storedToken
        ? new Response(null, { status: 200 })
        : new Response(null, { headers: { "set-auth-token": "token-1" }, status: 200 })
    );
    const adapter = createAdapter({
      fetch: fetcher,
      getSessionToken: () => storedToken,
      setSessionToken: (sessionToken) => {
        storedToken = sessionToken;
      }
    });

    createAuthTransport({ adapter });
    const options = createAuthClientMock.mock.calls[0]?.[0] as {
      fetchOptions: { customFetchImpl: typeof fetch };
    };
    const bearerFetch = options.fetchOptions.customFetchImpl;

    await bearerFetch("https://api.example.test/api/auth/sign-in/email", { method: "POST" });
    expect(storedToken).toBe("token-1");

    await bearerFetch("https://api.example.test/api/auth/get-session", { method: "GET" });
    const [, secondInit] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(secondInit.headers).get("authorization")).toBe("Bearer token-1");
    expect(secondInit.credentials).toBe("include");
  });

  it("delegates social sign-in to better-auth with the configured callback url", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({
      adapter: createAdapter({ socialCallbackUrl: "https://app.example.test" })
    });

    await expect(transport.signInWithSocial("github")).resolves.toBeUndefined();
    expect(client.signIn.social).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "https://app.example.test"
    });
  });

  it("logs out through better-auth and clears the stored token", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);
    const setSessionToken = vi.fn(() => undefined);

    const transport = createAuthTransport({ adapter: createAdapter({ setSessionToken }) });

    await transport.logout();

    expect(client.signOut).toHaveBeenCalled();
    expect(setSessionToken).toHaveBeenCalledWith(null);
  });

  it("keeps the stored token when logout fails", async () => {
    const client = createClientStub();
    client.signOut.mockResolvedValue({
      data: null,
      error: { status: 500, statusText: "Internal Server Error" }
    });
    createAuthClientMock.mockReturnValue(client);
    const setSessionToken = vi.fn(() => undefined);

    const transport = createAuthTransport({ adapter: createAdapter({ setSessionToken }) });

    await expect(transport.logout()).rejects.toThrow("auth request failed (500)");
    expect(setSessionToken).not.toHaveBeenCalled();
  });

  it("lists organizations with the active organization id from the session", async () => {
    const client = createClientStub();
    client.getSession.mockResolvedValue(sessionPayload("org-2"));
    client.organization.list.mockResolvedValue({
      data: [{ id: "org-2", name: "Acme", slug: "acme", createdAt: "2026-01-01" }],
      error: null
    });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.listOrganizations()).resolves.toEqual({
      activeOrganizationId: "org-2",
      organizations: [{ id: "org-2", name: "Acme", slug: "acme" }]
    });
  });

  it("maps organization members from the better-auth member payload", async () => {
    const client = createClientStub();
    client.organization.listMembers.mockResolvedValue({
      data: {
        members: [
          {
            id: "member-1",
            userId: "user-1",
            role: "owner",
            user: { id: "user-1", email: "user@example.com", name: "User" }
          }
        ],
        total: 1
      },
      error: null
    });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.listOrganizationMembers()).resolves.toEqual([
      {
        id: "member-1",
        userId: "user-1",
        email: "user@example.com",
        name: "User",
        role: "owner"
      }
    ]);
    expect(client.organization.listMembers).toHaveBeenCalledWith({ query: { limit: 100 } });
  });

  it("sets the active organization and returns the refreshed session", async () => {
    const client = createClientStub();
    client.getSession.mockResolvedValue(sessionPayload("org-2"));
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.setActiveOrganization("org-2")).resolves.toEqual(
      expectedSession("org-2")
    );
    expect(client.organization.setActive).toHaveBeenCalledWith({ organizationId: "org-2" });
  });

  it("retries organization creation with suffixed slugs on slug conflicts", async () => {
    const client = createClientStub();
    client.organization.create
      .mockResolvedValueOnce({
        data: null,
        error: { status: 400, code: "ORGANIZATION_ALREADY_EXISTS" }
      })
      .mockResolvedValueOnce({ data: { id: "org-3" }, error: null });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.createOrganization({ name: "Acme Inc" })).resolves.toEqual(
      expectedSession()
    );
    expect(client.organization.create).toHaveBeenNthCalledWith(1, {
      name: "Acme Inc",
      slug: "acme-inc"
    });
    expect(client.organization.create).toHaveBeenNthCalledWith(2, {
      name: "Acme Inc",
      slug: "acme-inc-2"
    });
  });

  it("fails organization creation with a clear error once slug candidates are exhausted", async () => {
    const client = createClientStub();
    client.organization.create.mockResolvedValue({
      data: null,
      error: { status: 400, code: "ORGANIZATION_ALREADY_EXISTS" }
    });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.createOrganization({ name: "Acme" })).rejects.toThrow(
      "failed to create organization: slug conflicts exhausted"
    );
    expect(client.organization.create).toHaveBeenCalledTimes(10);
  });

  it("fails organization creation immediately on non-conflict errors", async () => {
    const client = createClientStub();
    client.organization.create.mockResolvedValue({
      data: null,
      error: { status: 403, code: "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION" }
    });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.createOrganization({ name: "Acme" })).rejects.toThrow(
      "auth request failed (403)"
    );
    expect(client.organization.create).toHaveBeenCalledTimes(1);
  });
});

describe("parseSocialProviders", () => {
  it("returns no providers for empty or missing values", () => {
    expect(parseSocialProviders(undefined)).toEqual([]);
    expect(parseSocialProviders("")).toEqual([]);
    expect(parseSocialProviders(" , ")).toEqual([]);
  });

  it("parses known providers case-insensitively and ignores unknown entries", () => {
    expect(parseSocialProviders("github")).toEqual(["github"]);
    expect(parseSocialProviders("GitHub, google")).toEqual(["github", "google"]);
    expect(parseSocialProviders("facebook,google")).toEqual(["google"]);
  });
});
