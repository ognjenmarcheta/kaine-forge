import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock("./auth.instance", () => ({
  auth: {
    api: {
      getSession: getSessionMock
    }
  }
}));

vi.mock("@repo/db", () => ({
  db: {},
  membersTable: {},
  organizationsTable: {},
  usersTable: {},
  invitationsTable: {}
}));

const { createServerAuth } = await import("./auth.server");

describe("auth.server getSessionFromHeaders", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  it("maps a better-auth session response to the AuthSession shape", async () => {
    getSessionMock.mockResolvedValue({
      session: {
        id: "session-1",
        token: "session-token",
        userId: "user-1",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
        activeOrganizationId: "org-1"
      },
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: true,
        name: "User"
      }
    });

    const auth = createServerAuth();
    const session = await auth.getSessionFromHeaders({
      cookie: "kaine.session_token=signed-token"
    });

    expect(session).toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: true,
        name: "User"
      },
      expiresAt: "2026-03-01T00:00:00.000Z",
      activeOrganizationId: "org-1"
    });
  });

  it("defaults a missing activeOrganizationId to null", async () => {
    getSessionMock.mockResolvedValue({
      session: {
        id: "session-1",
        token: "session-token",
        userId: "user-1",
        expiresAt: "2026-03-01T00:00:00.000Z"
      },
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: false,
        name: "User"
      }
    });

    const auth = createServerAuth();
    const session = await auth.getSessionFromHeaders({});

    expect(session?.activeOrganizationId).toBeNull();
    expect(session?.expiresAt).toBe("2026-03-01T00:00:00.000Z");
    expect(session?.user.emailVerified).toBe(false);
  });

  it("returns null when better-auth resolves no session", async () => {
    getSessionMock.mockResolvedValue(null);

    const auth = createServerAuth();

    await expect(auth.getSessionFromHeaders({})).resolves.toBeNull();
  });

  it("converts node IncomingHttpHeaders (including array values) to fetch Headers", async () => {
    getSessionMock.mockResolvedValue(null);

    const auth = createServerAuth();
    await auth.getSessionFromHeaders({
      authorization: "Bearer session-token",
      "set-cookie": ["a=1", "b=2"],
      "x-empty": undefined
    });

    const headers = getSessionMock.mock.calls[0]?.[0]?.headers as Headers;

    expect(headers).toBeInstanceOf(Headers);
    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.get("set-cookie")).toBe("a=1, b=2");
    expect(headers.has("x-empty")).toBe(false);
  });

  it("passes fetch Headers through unchanged", async () => {
    getSessionMock.mockResolvedValue(null);

    const auth = createServerAuth();
    const input = new Headers({ authorization: "Bearer session-token" });
    await auth.getSessionFromHeaders(input);

    expect(getSessionMock.mock.calls[0]?.[0]?.headers).toBe(input);
  });
});
