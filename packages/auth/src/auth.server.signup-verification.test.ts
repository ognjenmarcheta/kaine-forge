import { beforeEach, describe, expect, it, vi } from "vitest";

let requireEmailVerification = false;

const sendMock = vi.fn();
const issueEmailVerificationMock = vi.fn();
const verifyEmailMock = vi.fn();
const resolveUserByIdMock = vi.fn();

vi.mock("@repo/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: async () => [{ id: "user-1", email: "user@example.com", name: "User" }]
      }))
    }))
  },
  sessionsTable: {},
  usersTable: {}
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn()
}));

vi.mock("@repo/email", () => ({
  createEmailSender: () => ({ send: sendMock })
}));

vi.mock("./auth.config", () => ({
  getServerAuthConfig: () => ({
    baseUrl: "http://localhost:4000",
    secret: "test-secret",
    requireEmailVerification
  })
}));

vi.mock("./auth.server.session", () => ({
  assertLoginInput: vi.fn(),
  assertSignupInput: vi.fn(),
  createSession: vi.fn().mockResolvedValue({ session: {}, sessionToken: "session-token" }),
  deleteSession: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue("scrypt$hash"),
  needsPasswordRehash: vi.fn(),
  resolveUserByEmail: vi.fn().mockResolvedValue(null),
  resolveUserById: resolveUserByIdMock,
  sessionFromToken: vi.fn(),
  toAuthSession: vi.fn(),
  updateSessionActiveOrganization: vi.fn(),
  updateUserPasswordHash: vi.fn(),
  verifyPassword: vi.fn()
}));

vi.mock("./auth.server.organization", () => ({
  createOwnedOrganizationForUser: vi.fn(),
  ensurePersonalOrganizationForUser: vi.fn().mockResolvedValue({ id: "org-1" }),
  getCurrentOrganizationForScope: vi.fn(),
  getOrganizationMembershipProof: vi.fn(),
  listOrganizationMembersForScope: vi.fn(),
  listOrganizationsForUser: vi.fn(),
  resolveActiveOrganizationForUser: vi.fn()
}));

vi.mock("./auth.server.invitation", () => ({
  acceptInvitation: vi.fn(),
  createInvitationForScope: vi.fn(),
  listInvitationsForScope: vi.fn(),
  revokeInvitationForScope: vi.fn()
}));

vi.mock("./auth.server.password-reset", () => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn()
}));

vi.mock("./auth.server.email-verification", () => ({
  issueEmailVerification: issueEmailVerificationMock,
  verifyEmail: verifyEmailMock
}));

const { createServerAuth } = await import("./auth.server");

const signupInput = {
  email: "user@example.com",
  name: "User",
  password: "Secret123!"
};

describe("auth.server email verification wiring", () => {
  beforeEach(() => {
    issueEmailVerificationMock.mockReset().mockResolvedValue(undefined);
    verifyEmailMock.mockReset().mockResolvedValue(undefined);
    resolveUserByIdMock.mockReset().mockResolvedValue(null);
  });

  it("issues a verification email on signup when requireEmailVerification is on", async () => {
    requireEmailVerification = true;
    const auth = createServerAuth();

    await auth.signUpWithPassword(signupInput);

    expect(issueEmailVerificationMock).toHaveBeenCalledTimes(1);
    expect(issueEmailVerificationMock).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: "user-1", email: "user@example.com" }),
      emailSender: { send: sendMock }
    });
  });

  it("does not issue a verification email when the flag is off (default)", async () => {
    requireEmailVerification = false;
    const auth = createServerAuth();

    await auth.signUpWithPassword(signupInput);

    expect(issueEmailVerificationMock).not.toHaveBeenCalled();
  });

  it("wires verifyEmail to the email-verification module", async () => {
    requireEmailVerification = false;
    const auth = createServerAuth();

    await auth.verifyEmail({ token: "tok" });

    expect(verifyEmailMock).toHaveBeenCalledWith({ token: "tok" });
  });

  it("resends a verification email for a fresh unverified user row", async () => {
    const freshUser = {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      emailVerified: false
    };
    resolveUserByIdMock.mockResolvedValue(freshUser);
    const auth = createServerAuth();

    await auth.resendEmailVerification({
      user: { id: "user-1", email: "stale@example.com", name: "User", emailVerified: false }
    });

    expect(resolveUserByIdMock).toHaveBeenCalledWith("user-1");
    expect(issueEmailVerificationMock).toHaveBeenCalledTimes(1);
    expect(issueEmailVerificationMock).toHaveBeenCalledWith({
      user: freshUser,
      emailSender: { send: sendMock }
    });
  });

  it("resolves silently without issuing when the user is already verified", async () => {
    resolveUserByIdMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
      emailVerified: true
    });
    const auth = createServerAuth();

    await expect(
      auth.resendEmailVerification({
        user: { id: "user-1", email: "user@example.com", name: "User", emailVerified: true }
      })
    ).resolves.toBeUndefined();

    expect(issueEmailVerificationMock).not.toHaveBeenCalled();
  });

  it("resolves silently without issuing when the user no longer exists", async () => {
    resolveUserByIdMock.mockResolvedValue(null);
    const auth = createServerAuth();

    await expect(
      auth.resendEmailVerification({
        user: { id: "ghost", email: "ghost@example.com", name: "Ghost", emailVerified: false }
      })
    ).resolves.toBeUndefined();

    expect(issueEmailVerificationMock).not.toHaveBeenCalled();
  });
});
