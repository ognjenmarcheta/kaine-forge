import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthRequestError,
  createAuthTransport,
  getAuthErrorMessageKey,
  isTwoFactorRequiredError,
  parseSocialProviders
} from "./auth.transport";
import type { AuthTransport, AuthTransportAdapter } from "./auth.transport";
import type { AuthSession } from "./auth.type";

const { createAuthClientMock, organizationClientMock } = vi.hoisted(() => ({
  createAuthClientMock: vi.fn(),
  organizationClientMock: vi.fn(() => ({ id: "organization" }))
}));

vi.mock("better-auth/client", () => ({
  createAuthClient: createAuthClientMock
}));

vi.mock("better-auth/client/plugins", () => ({
  emailOTPClient: () => ({ id: "email-otp" }),
  organizationClient: organizationClientMock,
  twoFactorClient: () => ({ id: "two-factor" })
}));

interface StubError {
  code?: string;
  message?: string;
  organizationName?: string;
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
    id?: string;
    expiresAt: Date | string;
  };
  user: {
    email: string;
    emailVerified: boolean;
    id: string;
    name: string;
    twoFactorEnabled?: boolean;
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
        twoFactorEnabled: false,
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
      twoFactorEnabled: false,
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
      emailOtp: vi.fn(async () => stubResult<Record<string, unknown>>({})),
      social: vi.fn(async () => stubResult({ url: "https://provider.example.test" }))
    },
    signUp: {
      email: vi.fn(async () => stubResult<Record<string, unknown>>({}))
    },
    signOut: vi.fn(async () => stubResult({ success: true })),
    twoFactor: {
      disable: vi.fn(async () => stubResult<Record<string, unknown>>({ status: true })),
      enable: vi.fn(async () =>
        stubResult<Record<string, unknown>>({
          backupCodes: ["code-1", "code-2"],
          totpURI: "otpauth://totp/Kaine%20Forge:user?secret=ABC"
        })
      ),
      generateBackupCodes: vi.fn(async () =>
        stubResult<{ backupCodes: string[] }>({ backupCodes: ["new-1"] })
      ),
      sendOtp: vi.fn(async () => stubResult<Record<string, unknown>>({ status: true })),
      verifyTotp: vi.fn(async () => stubResult<Record<string, unknown>>({})),
      verifyOtp: vi.fn(async () => stubResult<Record<string, unknown>>({})),
      verifyBackupCode: vi.fn(async () => stubResult<Record<string, unknown>>({}))
    },
    emailOtp: {
      requestPasswordReset: vi.fn(async () => stubResult({ success: true })),
      resetPassword: vi.fn(async () => stubResult({ success: true })),
      sendVerificationOtp: vi.fn(async () => stubResult({ success: true }))
    },
    $fetch: vi.fn(async () => stubResult<Record<string, unknown>>({})),
    listSessions: vi.fn(async () =>
      stubResult<
        {
          createdAt: string;
          id: string;
          ipAddress?: string | null;
          token: string;
          userAgent?: string | null;
        }[]
      >([])
    ),
    revokeSession: vi.fn(async () => stubResult({ status: true })),
    revokeOtherSessions: vi.fn(async () => stubResult({ status: true })),
    updateUser: vi.fn(async () => stubResult({ status: true })),
    changePassword: vi.fn(async () => stubResult<Record<string, unknown>>({ token: null })),
    changeEmail: vi.fn(async () => stubResult({ status: true })),
    listAccounts: vi.fn(async () =>
      stubResult<{ createdAt: string; id: string; providerId: string }[]>([])
    ),
    linkSocial: vi.fn(async () => stubResult({ redirect: true, url: "https://provider.test" })),
    unlinkAccount: vi.fn(async () => stubResult({ status: true })),
    deleteUser: vi.fn(async () => stubResult({ success: true, message: "User deleted" })),
    organization: {
      list: vi.fn(async () =>
        stubResult<
          { createdAt?: string; id: string; name: string; personal?: boolean; slug: string }[]
        >([])
      ),
      listInvitations: vi.fn(async () =>
        stubResult<
          { email: string; expiresAt: string; id: string; role: string; status: string }[]
        >([])
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
    expect(options.plugins).toEqual([
      { id: "organization" },
      { id: "two-factor" },
      { id: "email-otp" }
    ]);
    expect(options.fetchOptions.credentials).toBe("include");
  });

  it("forwards optional client plugins (e.g. Expo) after the built-in plugins", () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);
    const expoPlugin = { id: "expo-client" };

    createAuthTransport({
      adapter: createAdapter({ clientPlugins: [expoPlugin] })
    });

    const options = createAuthClientMock.mock.calls[0]?.[0] as {
      plugins: unknown[];
    };
    expect(options.plugins).toEqual([
      { id: "organization" },
      { id: "two-factor" },
      { id: "email-otp" },
      expoPlugin
    ]);
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
          twoFactorEnabled: false,
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
        twoFactorEnabled: false,
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
    expect(client.signIn.email).toHaveBeenCalledWith(
      { email: "user@example.com", password: "secret" },
      undefined
    );
  });

  it("sends the captcha token as the x-captcha-response header", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await transport.loginWithPassword({
      email: "user@example.com",
      password: "secret",
      captchaToken: "turnstile-token"
    });

    expect(client.signIn.email).toHaveBeenCalledWith(
      { email: "user@example.com", password: "secret" },
      { headers: { "x-captcha-response": "turnstile-token" } }
    );
  });

  it("signals a required second factor instead of reading a session that does not exist", async () => {
    const client = createClientStub();
    client.signIn.email.mockResolvedValue(
      stubResult<Record<string, unknown>>({
        twoFactorRedirect: true,
        twoFactorMethods: ["totp", "otp"]
      })
    );
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });
    const error: unknown = await transport
      .loginWithPassword({ email: "user@example.com", password: "secret" })
      .catch((caught: unknown) => caught);

    expect(isTwoFactorRequiredError(error)).toBe(true);
    expect(error).toMatchObject({ twoFactorMethods: ["totp", "otp"] });
    expect(client.getSession).not.toHaveBeenCalled();
  });

  it.each([
    { method: "totp", call: "verifyTotp" },
    { method: "otp", call: "verifyOtp" },
    { method: "backup", call: "verifyBackupCode" }
  ] as const)("completes a two-factor sign-in with a $method code", async ({ method, call }) => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(
      transport.verifyTwoFactor({ method, code: "123456", trustDevice: true })
    ).resolves.toEqual(expectedSession());
    expect(client.twoFactor[call]).toHaveBeenCalledWith({ code: "123456", trustDevice: true });
  });

  it("starts TOTP enrollment with the password and returns the URI and backup codes", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.enableTwoFactor("secret")).resolves.toEqual({
      backupCodes: ["code-1", "code-2"],
      totpUri: "otpauth://totp/Kaine%20Forge:user?secret=ABC"
    });
    expect(client.twoFactor.enable).toHaveBeenCalledWith({ password: "secret" });
  });

  it("returns the regenerated backup codes", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.regenerateBackupCodes("secret")).resolves.toEqual(["new-1"]);
    expect(client.twoFactor.generateBackupCodes).toHaveBeenCalledWith({ password: "secret" });
  });

  type Client = ReturnType<typeof createClientStub>;
  type Transport = ReturnType<typeof createAuthTransport>;

  // Each step sends the body the better-auth endpoint expects; email-code
  // requests also carry the captcha token. `call` names the client method.
  const authSteps: {
    name: string;
    run: (transport: Transport) => Promise<unknown>;
    call: (client: Client) => (...args: never[]) => unknown;
    args: unknown[];
  }[] = [
    {
      name: "sends a sign-in code with the captcha token",
      run: (transport) =>
        transport.sendSignInOtp({ email: "user@example.com", captchaToken: "turnstile-token" }),
      call: (client) => client.emailOtp.sendVerificationOtp,
      args: [
        { email: "user@example.com", type: "sign-in" },
        { headers: { "x-captcha-response": "turnstile-token" } }
      ]
    },
    {
      name: "signs in with an email code",
      run: (transport) => transport.signInWithOtp({ email: "user@example.com", otp: "123456" }),
      call: (client) => client.signIn.emailOtp,
      args: [{ email: "user@example.com", otp: "123456" }]
    },
    {
      name: "requests a password reset code",
      run: (transport) => transport.requestPasswordResetOtp({ email: "user@example.com" }),
      call: (client) => client.emailOtp.requestPasswordReset,
      args: [{ email: "user@example.com" }, undefined]
    },
    {
      name: "resets the password with an email code",
      run: (transport) =>
        transport.resetPasswordWithOtp({
          email: "user@example.com",
          otp: "123456",
          password: "new-password"
        }),
      call: (client) => client.emailOtp.resetPassword,
      args: [{ email: "user@example.com", otp: "123456", password: "new-password" }]
    },
    {
      name: "emails a second-factor code",
      run: (transport) => transport.sendTwoFactorOtp(),
      call: (client) => client.twoFactor.sendOtp,
      args: []
    },
    {
      name: "verifies TOTP enrollment",
      run: (transport) => transport.verifyTotpEnrollment("654321"),
      call: (client) => client.twoFactor.verifyTotp,
      args: [{ code: "654321" }]
    },
    {
      name: "turns two-factor off with the password",
      run: (transport) => transport.disableTwoFactor("secret"),
      call: (client) => client.twoFactor.disable,
      args: [{ password: "secret" }]
    },
    {
      name: "stores the language of the user's emails",
      run: (transport) => transport.updateEmailLanguage("de"),
      call: (client) => client.$fetch,
      args: ["/update-user", { method: "POST", body: { locale: "de" } }]
    }
  ];

  it.each(authSteps)("$name", async ({ run, call, args }) => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    await run(createAuthTransport({ adapter: createAdapter() }));

    expect(call(client)).toHaveBeenCalledWith(...args);
  });

  it.each(authSteps)(
    "fails with the server error code instead of reporting success: $name",
    async ({ run, call }) => {
      const client = createClientStub();
      const method = call(client);
      // SAFETY: every client stub method is a vi.fn mock created in createClientStub.
      vi.mocked(method as () => Promise<unknown>).mockResolvedValue({
        data: null,
        error: { status: 400, code: "INVALID_OTP" }
      });
      createAuthClientMock.mockReturnValue(client);

      await expect(run(createAuthTransport({ adapter: createAdapter() }))).rejects.toMatchObject({
        code: "INVALID_OTP"
      });
    }
  );

  it("keeps the better-auth error code so clients can show a precise message", async () => {
    const client = createClientStub();
    client.signUp.email.mockResolvedValue({
      data: null,
      error: { status: 400, code: "PASSWORD_COMPROMISED" }
    });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });
    const error: unknown = await transport
      .signupWithPassword({ email: "user@example.com", name: "User", password: "password1" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AuthRequestError);
    expect(getAuthErrorMessageKey(error)).toBe("auth.error.passwordCompromised");
    expect(getAuthErrorMessageKey(new Error("network down"))).toBe("error.generic");
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
    expect(client.signUp.email).toHaveBeenCalledWith(
      { email: "user@example.com", name: "User", password: "secret" },
      undefined
    );
  });

  it("signs up with the UI language as the language of the user's emails", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    await createAuthTransport({ adapter: createAdapter() }).signupWithPassword({
      email: "user@example.com",
      name: "User",
      password: "secret",
      locale: "de"
    });

    expect(client.signUp.email).toHaveBeenCalledWith(
      { email: "user@example.com", name: "User", password: "secret", locale: "de" },
      undefined
    );
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
    const fetcher = vi.fn<AuthTransportAdapter["fetch"]>(async () =>
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
    const secondInit = fetcher.mock.calls[1]?.[1];
    expect(new Headers(secondInit?.headers).get("authorization")).toBe("Bearer token-1");
    expect(secondInit?.credentials).toBe("include");
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
      data: [
        { id: "org-1", name: "Personal", slug: "personal-1", personal: true },
        { id: "org-2", name: "Acme", slug: "acme", createdAt: "2026-01-01" }
      ],
      error: null
    });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.listOrganizations()).resolves.toEqual({
      activeOrganizationId: "org-2",
      organizations: [
        { id: "org-1", name: "Personal", slug: "personal-1", personal: true },
        { id: "org-2", name: "Acme", slug: "acme", personal: false }
      ]
    });
  });

  it("lists only pending, unexpired invitations", async () => {
    const client = createClientStub();
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    client.organization.listInvitations.mockResolvedValue(
      stubResult([
        {
          id: "pending",
          email: "a@example.com",
          role: "member",
          status: "pending",
          expiresAt: future
        },
        {
          id: "expired",
          email: "b@example.com",
          role: "member",
          status: "pending",
          expiresAt: past
        },
        {
          id: "accepted",
          email: "c@example.com",
          role: "admin",
          status: "accepted",
          expiresAt: future
        }
      ])
    );
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.listInvitations()).resolves.toEqual([
      {
        id: "pending",
        email: "a@example.com",
        role: "member",
        status: "pending",
        expiresAt: future
      }
    ]);
  });

  it("leaves and deletes without sending an organization id", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.leaveOrganization()).resolves.toEqual(expectedSession());
    await expect(transport.deleteOrganization()).resolves.toEqual(expectedSession());
    expect(client.$fetch.mock.calls).toEqual([
      ["/organization/leave", { method: "POST", body: {} }],
      ["/organization/delete", { method: "POST", body: {} }]
    ]);
  });

  it("lists sessions with a marker on this device and revokes one by its id", async () => {
    const client = createClientStub();
    const current = sessionPayload();
    client.getSession.mockResolvedValue({
      ...current,
      data: current.data && {
        ...current.data,
        session: { ...current.data.session, id: "session-1" }
      }
    });
    client.listSessions.mockResolvedValue(
      stubResult([
        {
          id: "session-1",
          token: "token-1",
          userAgent: "Firefox",
          ipAddress: "10.0.0.1",
          createdAt: "2026-10-01T08:00:00.000Z"
        },
        {
          id: "session-2",
          token: "token-2",
          userAgent: null,
          ipAddress: null,
          createdAt: "2026-10-02T08:00:00.000Z"
        }
      ])
    );
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });

    await expect(transport.listSessions()).resolves.toEqual([
      {
        id: "session-1",
        userAgent: "Firefox",
        ipAddress: "10.0.0.1",
        createdAt: "2026-10-01T08:00:00.000Z",
        current: true
      },
      {
        id: "session-2",
        userAgent: null,
        ipAddress: null,
        createdAt: "2026-10-02T08:00:00.000Z",
        current: false
      }
    ]);
    await transport.revokeSession("session-2");
    expect(client.revokeSession.mock.calls).toEqual([[{ token: "token-2" }]]);
  });

  it("sends account changes for the session user and maps linked accounts", async () => {
    const client = createClientStub();
    client.listAccounts.mockResolvedValue(
      stubResult([
        { id: "account-1", providerId: "credential", createdAt: "2026-10-01T08:00:00.000Z" }
      ])
    );
    client.$fetch.mockResolvedValue(stubResult({ providers: ["google", "unknown"] }));
    createAuthClientMock.mockReturnValue(client);
    const setSessionToken = vi.fn();

    const transport = createAuthTransport({ adapter: createAdapter({ setSessionToken }) });

    await expect(transport.updateProfile({ name: "Ada" })).resolves.toEqual(expectedSession());
    await transport.changePassword({
      currentPassword: "old-secret",
      newPassword: "new-secret",
      revokeOtherSessions: true
    });
    await transport.changeEmail({ newEmail: "new@example.com" });
    await transport.changeEmail({
      newEmail: "new@example.com",
      callbackUrl: "https://app.example.test/account"
    });
    await transport.revokeOtherSessions();
    await expect(transport.listAccounts()).resolves.toEqual([
      { id: "account-1", providerId: "credential", createdAt: "2026-10-01T08:00:00.000Z" }
    ]);
    await expect(transport.listSocialProviders()).resolves.toEqual(["google"]);
    await transport.linkSocialAccount({
      provider: "github",
      callbackUrl: "https://app.example.test/account"
    });
    await transport.unlinkAccount("account-2");
    await transport.requestAccountDeletion();
    await transport.confirmAccountDeletion("delete-token-1");

    expect(client.updateUser.mock.calls).toEqual([[{ name: "Ada" }]]);
    expect(client.changePassword.mock.calls).toEqual([
      [{ currentPassword: "old-secret", newPassword: "new-secret", revokeOtherSessions: true }]
    ]);
    expect(client.changeEmail.mock.calls).toEqual([
      [{ newEmail: "new@example.com" }],
      [{ newEmail: "new@example.com", callbackURL: "https://app.example.test/account" }]
    ]);
    expect(client.revokeOtherSessions).toHaveBeenCalledTimes(1);
    expect(client.linkSocial.mock.calls).toEqual([
      [{ provider: "github", callbackURL: "https://app.example.test/account" }]
    ]);
    expect(client.unlinkAccount.mock.calls).toEqual([[{ accountId: "account-2" }]]);
    expect(client.deleteUser.mock.calls).toEqual([[{}], [{ token: "delete-token-1" }]]);
    // The deleted account's bearer token is dropped.
    expect(setSessionToken.mock.calls).toEqual([[null]]);
  });

  it("does not revoke anything for a session id the user does not have", async () => {
    const client = createClientStub();
    createAuthClientMock.mockReturnValue(client);

    await createAuthTransport({ adapter: createAdapter() }).revokeSession("session-unknown");

    expect(client.revokeSession).not.toHaveBeenCalled();
  });

  it.each([
    ["updateProfile", (transport: AuthTransport) => transport.updateProfile({ name: "Ada" })],
    [
      "changePassword",
      (transport: AuthTransport) =>
        transport.changePassword({
          currentPassword: "wrong",
          newPassword: "new-secret",
          revokeOtherSessions: false
        })
    ],
    [
      "changeEmail",
      (transport: AuthTransport) => transport.changeEmail({ newEmail: "new@example.com" })
    ],
    ["listSessions", (transport: AuthTransport) => transport.listSessions()],
    // Revoking looks the session up first; the revoke itself fails.
    ["revokeSession", (transport: AuthTransport) => transport.revokeSession("session-2"), true],
    ["revokeOtherSessions", (transport: AuthTransport) => transport.revokeOtherSessions()],
    ["listAccounts", (transport: AuthTransport) => transport.listAccounts()],
    ["listSocialProviders", (transport: AuthTransport) => transport.listSocialProviders()],
    [
      "linkSocialAccount",
      (transport: AuthTransport) => transport.linkSocialAccount({ provider: "github" })
    ],
    ["unlinkAccount", (transport: AuthTransport) => transport.unlinkAccount("account-1")],
    ["confirmAccountDeletion", (transport: AuthTransport) => transport.confirmAccountDeletion("t")]
  ])("keeps the better-auth error code when %s fails", async (_name, call, listed = false) => {
    const failure = { data: null, error: { status: 400, code: "INVALID_PASSWORD" } };
    const client = createClientStub();
    for (const method of [
      client.updateUser,
      client.changePassword,
      client.changeEmail,
      client.listSessions,
      client.revokeSession,
      client.revokeOtherSessions,
      client.listAccounts,
      client.$fetch,
      client.linkSocial,
      client.unlinkAccount,
      client.deleteUser
    ]) {
      method.mockResolvedValue(failure);
    }
    if (listed) {
      client.listSessions.mockResolvedValueOnce(
        stubResult([{ id: "session-2", token: "token-2", createdAt: "2026-10-02T08:00:00.000Z" }])
      );
    }
    createAuthClientMock.mockReturnValue(client);

    const error: unknown = await call(createAuthTransport({ adapter: createAdapter() })).catch(
      (caught: unknown) => caught
    );

    expect(getAuthErrorMessageKey(error)).toBe("auth.account.error.invalidPassword");
  });

  it("names the organization that blocks an account deletion", async () => {
    const client = createClientStub();
    client.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 400, code: "SOLE_OWNER_OF_SHARED_ORGANIZATION", organizationName: "Acme" }
    });
    createAuthClientMock.mockReturnValue(client);

    const transport = createAuthTransport({ adapter: createAdapter() });
    const error: unknown = await transport
      .requestAccountDeletion()
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ organizationName: "Acme" });
    expect(getAuthErrorMessageKey(error)).toBe("auth.account.error.soleOwner");
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
