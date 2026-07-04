import { describe, expect, it, vi } from "vitest";

// The instance module imports @repo/db, whose client requires DATABASE_URL at
// import time (the pg Pool never connects during these tests).
vi.stubEnv("DATABASE_URL", "postgresql://dummy:dummy@localhost:5432/dummy");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
vi.stubEnv("API_CORS_ORIGINS", "http://localhost:5173, https://app.example.com");

const organizationMocks = vi.hoisted(() => ({
  ensurePersonalOrganizationForUser: vi.fn(),
  resolveActiveOrganizationForUser: vi.fn()
}));

vi.mock("./auth.server.organization", () => organizationMocks);

const { auth } = await import("./auth.instance");

describe("auth.instance database hooks", () => {
  it("ensures a personal organization after every user create", async () => {
    const after = auth.options.databaseHooks?.user?.create?.after;

    expect(after).toBeTypeOf("function");

    await after?.({
      id: "user-1",
      email: "user@example.com",
      emailVerified: false,
      name: "User",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    expect(organizationMocks.ensurePersonalOrganizationForUser).toHaveBeenCalledWith("user-1");
  });

  it("injects a resolved activeOrganizationId into new sessions", async () => {
    organizationMocks.resolveActiveOrganizationForUser.mockResolvedValue("org-1");

    const before = auth.options.databaseHooks?.session?.create?.before;

    expect(before).toBeTypeOf("function");

    const session = {
      id: "session-1",
      token: "token-1",
      userId: "user-1",
      expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await before?.(session);

    expect(organizationMocks.resolveActiveOrganizationForUser).toHaveBeenCalledWith({
      requestedActiveOrganizationId: null,
      userId: "user-1"
    });
    expect(result).toEqual({
      data: { ...session, activeOrganizationId: "org-1" }
    });
  });

  it("keeps an activeOrganizationId already present on the session data", async () => {
    organizationMocks.resolveActiveOrganizationForUser.mockImplementation(
      async (params: { requestedActiveOrganizationId: string | null }) =>
        params.requestedActiveOrganizationId ?? "org-fallback"
    );

    const before = auth.options.databaseHooks?.session?.create?.before;

    const result = await before?.({
      id: "session-1",
      token: "token-1",
      userId: "user-1",
      activeOrganizationId: "org-2",
      expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    expect(organizationMocks.resolveActiveOrganizationForUser).toHaveBeenCalledWith({
      requestedActiveOrganizationId: "org-2",
      userId: "user-1"
    });
    expect(result && typeof result === "object" && "data" in result).toBe(true);
  });

  it("stamps the creating user as organization owner through the plugin hook", async () => {
    const organizationPlugin = (auth.options.plugins ?? []).find(
      (plugin) => plugin.id === "organization"
    ) as
      | {
          options?: {
            organizationHooks?: {
              beforeCreateOrganization?: (data: {
                organization: Record<string, unknown>;
                user: { id: string };
              }) => Promise<void | { data: Record<string, unknown> }>;
            };
          };
        }
      | undefined;

    const beforeCreateOrganization =
      organizationPlugin?.options?.organizationHooks?.beforeCreateOrganization;

    expect(beforeCreateOrganization).toBeTypeOf("function");

    const response = await beforeCreateOrganization?.({
      organization: { name: "Acme", slug: "acme" },
      user: { id: "user-1" }
    });

    expect(response).toEqual({
      data: { name: "Acme", slug: "acme", userId: "user-1" }
    });
  });

  it("trusts the origins configured through API_CORS_ORIGINS", () => {
    expect(auth.options.trustedOrigins).toEqual([
      "http://localhost:5173",
      "https://app.example.com"
    ]);
  });
});
