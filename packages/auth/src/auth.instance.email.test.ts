import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The instance module imports @repo/db, whose client requires DATABASE_URL at
// import time (the pg Pool never connects during these tests).
vi.stubEnv("DATABASE_URL", "postgresql://dummy:dummy@localhost:5432/dummy");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
vi.stubEnv("WEB_APP_URL", "https://app.example.com");

const jobMocks = vi.hoisted(() => ({ enqueue: vi.fn() }));

// Hooks enqueue an email job; the job runner delivers it (ADR 0018).
vi.mock("@repo/jobs/client", () => ({
  jobQueue: { enqueue: jobMocks.enqueue }
}));

const { AUTH_DEFINITIONS } = await import("./auth.definition");
const { auth, createAuthInstance } = await import("./auth.instance");

const user = {
  id: "user-1",
  email: "user@example.com",
  emailVerified: false,
  twoFactorEnabled: false,
  name: "User",
  createdAt: new Date(),
  updatedAt: new Date()
};

interface EmailOtpData {
  email: string;
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
}

interface OrganizationPluginOptions {
  invitationExpiresIn?: number;
  requireEmailVerificationOnInvitation?: boolean;
  sendInvitationEmail?: (data: {
    email: string;
    id: string;
    invitation: unknown;
    inviter: unknown;
    organization: { id: string; name: string };
    role: string;
  }) => Promise<void>;
}

function getOrganizationPluginOptions(
  instance: typeof auth = auth
): OrganizationPluginOptions | undefined {
  const plugin = (instance.options.plugins ?? []).find((entry) => entry.id === "organization") as
    { options?: OrganizationPluginOptions } | undefined;

  return plugin?.options;
}

async function sendInvitation(email: string): Promise<void> {
  const sendInvitationEmail = getOrganizationPluginOptions()?.sendInvitationEmail;

  expect(sendInvitationEmail).toBeTypeOf("function");

  await sendInvitationEmail?.({
    id: "inv-1",
    role: "member",
    email,
    organization: { id: "org-1", name: "Acme" },
    invitation: { id: "inv-1" },
    inviter: { userId: "user-1" }
  });
}

describe("auth.instance email hooks", () => {
  beforeEach(() => {
    jobMocks.enqueue.mockReset();
    jobMocks.enqueue.mockResolvedValue("job-1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enqueues the password reset email with the url and raw token", async () => {
    const sendResetPassword = auth.options.emailAndPassword?.sendResetPassword;

    expect(sendResetPassword).toBeTypeOf("function");

    await sendResetPassword?.({ user, url: "http://localhost:4000/reset?token=tok", token: "tok" });

    expect(jobMocks.enqueue).toHaveBeenCalledWith("email.send", {
      to: "user@example.com",
      subject: "Reset your password",
      text: expect.stringContaining("http://localhost:4000/reset?token=tok")
    });
    expect(jobMocks.enqueue.mock.calls[0]?.[1]?.text).toContain("tok");
  });

  it("mirrors the legacy password reset token lifetime", () => {
    expect(auth.options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(
      AUTH_DEFINITIONS.PASSWORD_RESET_MAX_AGE_SECONDS
    );
  });

  it("resolves the password reset hook even when enqueue fails", async () => {
    jobMocks.enqueue.mockRejectedValue(new Error("database unavailable"));

    await expect(
      auth.options.emailAndPassword?.sendResetPassword?.({ user, url: "http://u", token: "tok" })
    ).resolves.toBeUndefined();
  });

  it("enqueues the verification email with the url and raw token", async () => {
    const sendVerificationEmail = auth.options.emailVerification?.sendVerificationEmail;

    expect(sendVerificationEmail).toBeTypeOf("function");

    await sendVerificationEmail?.({
      user,
      url: "http://localhost:4000/verify?token=vtok",
      token: "vtok"
    });

    expect(jobMocks.enqueue).toHaveBeenCalledWith("email.send", {
      to: "user@example.com",
      subject: "Verify your email address",
      text: expect.stringContaining("http://localhost:4000/verify?token=vtok")
    });
    expect(jobMocks.enqueue.mock.calls[0]?.[1]?.text).toContain("vtok");
  });

  it("mirrors the legacy email verification token lifetime", () => {
    expect(auth.options.emailVerification?.expiresIn).toBe(
      AUTH_DEFINITIONS.EMAIL_VERIFICATION_MAX_AGE_SECONDS
    );
  });

  it("resolves the verification hook even when enqueue fails", async () => {
    jobMocks.enqueue.mockRejectedValue(new Error("database unavailable"));

    await expect(
      auth.options.emailVerification?.sendVerificationEmail?.({
        user,
        url: "http://u",
        token: "vtok"
      })
    ).resolves.toBeUndefined();
  });

  it("only sends verification on signup when AUTH_REQUIRE_EMAIL_VERIFICATION is true", () => {
    vi.stubEnv("AUTH_REQUIRE_EMAIL_VERIFICATION", "true");

    expect(createAuthInstance().options.emailVerification?.sendOnSignUp).toBe(true);

    vi.stubEnv("AUTH_REQUIRE_EMAIL_VERIFICATION", "false");

    expect(createAuthInstance().options.emailVerification?.sendOnSignUp).toBe(false);
  });

  it("never gates login on verification, even in soft verification mode (ADR 0007)", () => {
    vi.stubEnv("AUTH_REQUIRE_EMAIL_VERIFICATION", "true");

    // The options literal deliberately omits the key, so widen to inspect it.
    const emailAndPassword = createAuthInstance().options.emailAndPassword as
      { requireEmailVerification?: boolean } | undefined;

    expect(emailAndPassword?.requireEmailVerification).toBeUndefined();
  });

  it.each(["sign-in", "forget-password"] as const)(
    "enqueues the %s one-time code email to the requested address",
    async (type) => {
      const plugin = (auth.options.plugins ?? []).find((entry) => entry.id === "email-otp") as
        { options?: { sendVerificationOTP?: (data: EmailOtpData) => Promise<void> } } | undefined;

      await plugin?.options?.sendVerificationOTP?.({
        email: "user@example.com",
        otp: "482913",
        type
      });

      await vi.waitFor(() => {
        expect(jobMocks.enqueue).toHaveBeenCalledWith(
          "email.send",
          expect.objectContaining({
            to: "user@example.com",
            text: expect.stringContaining("482913")
          })
        );
      });
    }
  );

  it("enqueues the two-factor code email to the signed-in user", async () => {
    const plugin = (auth.options.plugins ?? []).find((entry) => entry.id === "two-factor") as
      | {
          options?: {
            otpOptions?: { sendOTP?: (data: { user: typeof user; otp: string }) => void };
          };
        }
      | undefined;

    plugin?.options?.otpOptions?.sendOTP?.({ user, otp: "731045" });

    await vi.waitFor(() => {
      expect(jobMocks.enqueue).toHaveBeenCalledWith(
        "email.send",
        expect.objectContaining({ to: "user@example.com", text: expect.stringContaining("731045") })
      );
    });
  });

  it("enqueues the invitation email with the organization name and accept URL", async () => {
    await sendInvitation("invited@example.com");

    expect(jobMocks.enqueue).toHaveBeenCalledWith("email.send", {
      to: "invited@example.com",
      subject: expect.stringContaining("Acme"),
      text: expect.stringContaining("https://app.example.com/invitations/inv-1")
    });
    expect(jobMocks.enqueue.mock.calls[0]?.[1]?.text).toContain("Acme");
  });

  it("resolves the invitation hook even when enqueue fails", async () => {
    jobMocks.enqueue.mockRejectedValue(new Error("database unavailable"));

    await expect(sendInvitation("invited@example.com")).resolves.toBeUndefined();
  });

  it("mirrors the legacy invitation lifetime on the organization plugin", () => {
    expect(getOrganizationPluginOptions()?.invitationExpiresIn).toBe(
      AUTH_DEFINITIONS.INVITATION_MAX_AGE_SECONDS
    );
  });

  it("keeps invitation acceptance open to unverified recipients (ADR 0007)", () => {
    // With a custom advanced.database.generateId, better-auth's heuristic
    // would otherwise demand a verified email before accept/reject/get by
    // invitation id; our ids are opaque UUIDs, so we pin the option off.
    expect(getOrganizationPluginOptions()?.requireEmailVerificationOnInvitation).toBe(false);
  });
});
