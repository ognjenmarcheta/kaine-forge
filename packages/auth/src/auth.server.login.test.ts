import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  assertLoginInput: vi.fn(),
  assertSignupInput: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  resolveUserByEmail: vi.fn(),
  resolveUserById: vi.fn(),
  sessionFromToken: vi.fn(),
  toAuthSession: vi.fn(),
  updateSessionActiveOrganization: vi.fn(),
  updateUserPasswordHash: vi.fn()
}));

const passwordMocks = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  needsPasswordRehash: vi.fn(),
  verifyPassword: vi.fn()
}));

const organizationMocks = vi.hoisted(() => ({
  createOwnedOrganizationForUser: vi.fn(),
  ensurePersonalOrganizationForUser: vi.fn(),
  getCurrentOrganizationForScope: vi.fn(),
  getOrganizationMembershipProof: vi.fn(),
  listOrganizationMembersForScope: vi.fn(),
  listOrganizationsForUser: vi.fn(),
  resolveActiveOrganizationForUser: vi.fn()
}));

vi.mock("@repo/db", () => ({ db: {}, sessionsTable: {}, usersTable: {} }));
vi.mock("@repo/email", () => ({ createEmailSender: () => ({ send: vi.fn() }) }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("./auth.config", () => ({
  getServerAuthConfig: () => ({
    baseUrl: "http://localhost:4000",
    requireEmailVerification: false,
    secret: "test-secret"
  })
}));
vi.mock("./auth.server.email-verification", () => ({
  issueEmailVerification: vi.fn(),
  verifyEmail: vi.fn()
}));
vi.mock("./auth.server.invitation", () => ({
  acceptInvitation: vi.fn(),
  createInvitationForScope: vi.fn(),
  listInvitationsForScope: vi.fn(),
  revokeInvitationForScope: vi.fn()
}));
vi.mock("./auth.server.organization", () => organizationMocks);
vi.mock("./auth.server.password-reset", () => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn()
}));
vi.mock("./auth.server.session", () => sessionMocks);
vi.mock("./auth.password", async (importActual) => ({
  ...(await importActual<typeof import("./auth.password")>()),
  ...passwordMocks
}));

const { createServerAuth } = await import("./auth.server");
const { DUMMY_PASSWORD_HASH } =
  await vi.importActual<typeof import("./auth.password")>("./auth.password");

const user = {
  id: "user-1",
  email: "user@example.com",
  emailVerified: true,
  name: "User",
  passwordHash: "stored-hash"
};

describe("auth.server loginWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("burns a dummy password verification before rejecting unknown emails", async () => {
    sessionMocks.resolveUserByEmail.mockResolvedValue(null);
    passwordMocks.verifyPassword.mockResolvedValue(false);

    const auth = createServerAuth();

    await expect(
      auth.loginWithPassword({ email: "ghost@example.com", password: "Secret123!" })
    ).rejects.toThrow("invalid credentials");

    // The unknown-email path must do the same scrypt-shaped work as the
    // known-email path so response timing does not reveal account existence.
    expect(passwordMocks.verifyPassword).toHaveBeenCalledWith("Secret123!", DUMMY_PASSWORD_HASH);
  });

  it("keeps the dummy hash aligned with the live scrypt parameters", async () => {
    // Uses the REAL auth.password module (bypassing the mock above):
    // this fails the moment SCRYPT_COST/r/p drift from the parameters
    // DUMMY_PASSWORD_HASH was generated with, forcing a regeneration.
    const actualPassword =
      await vi.importActual<typeof import("./auth.password")>("./auth.password");

    expect(actualPassword.needsPasswordRehash(DUMMY_PASSWORD_HASH)).toBe(false);
  });

  it("still resolves the login when the opportunistic rehash fails", async () => {
    sessionMocks.resolveUserByEmail.mockResolvedValue(user);
    passwordMocks.verifyPassword.mockResolvedValue(true);
    passwordMocks.needsPasswordRehash.mockReturnValue(true);
    passwordMocks.hashPassword.mockResolvedValue("new-hash");
    sessionMocks.updateUserPasswordHash.mockRejectedValue(new Error("db write failed"));
    organizationMocks.resolveActiveOrganizationForUser.mockResolvedValue("org-1");
    sessionMocks.createSession.mockResolvedValue({
      sessionToken: "token",
      session: { activeOrganizationId: "org-1" }
    });

    const auth = createServerAuth();

    await expect(
      auth.loginWithPassword({ email: "user@example.com", password: "Secret123!" })
    ).resolves.toMatchObject({ sessionToken: "token" });

    expect(sessionMocks.updateUserPasswordHash).toHaveBeenCalledWith("user-1", "new-hash");
    expect(sessionMocks.createSession).toHaveBeenCalledWith({
      user,
      activeOrganizationId: "org-1"
    });
  });
});
