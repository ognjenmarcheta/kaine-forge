import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";

// M3 deleted the custom acceptInvitation module whose email-match check
// stopped authenticated users from accepting invitations addressed to someone
// else. better-auth's accept-invitation route enforces the same invariant
// unconditionally (dist/plugins/organization/routes/crud-invites.mjs, the
// YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION guard). This test pins that
// upstream behavior against version bumps using the memory adapter and the
// invitation-relevant options mirrored from auth.instance.ts.
function createTestAuth() {
  return betterAuth({
    baseURL: "http://localhost:4000",
    secret: "test-secret-test-secret-test-secret-1234",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      organization: [],
      member: [],
      invitation: []
    }),
    emailAndPassword: { enabled: true },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID()
      }
    },
    plugins: [
      organization({
        requireEmailVerificationOnInvitation: false
      })
    ]
  });
}

type TestAuth = ReturnType<typeof createTestAuth>;

async function signUp(auth: TestAuth, email: string, name: string): Promise<Headers> {
  const { headers } = await auth.api.signUpEmail({
    body: { email, password: "Secret123!", name },
    returnHeaders: true
  });

  const cookie = headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");

  return new Headers({ cookie });
}

async function createPendingInvitation(auth: TestAuth) {
  const inviterHeaders = await signUp(auth, "owner@example.com", "Owner");
  const createdOrganization = await auth.api.createOrganization({
    body: { name: "Acme", slug: "acme" },
    headers: inviterHeaders
  });

  if (!createdOrganization) {
    throw new Error("expected organization to be created");
  }

  const invitation = await auth.api.createInvitation({
    body: {
      email: "invited@example.com",
      role: "member",
      organizationId: createdOrganization.id
    },
    headers: inviterHeaders
  });

  return { invitation, organizationId: createdOrganization.id };
}

describe("organization accept-invitation email enforcement", () => {
  it("forbids an authenticated user whose email does not match the invitation", async () => {
    const auth = createTestAuth();
    const { invitation } = await createPendingInvitation(auth);
    const attackerHeaders = await signUp(auth, "attacker@example.com", "Attacker");

    await expect(
      auth.api.acceptInvitation({
        body: { invitationId: invitation.id },
        headers: attackerHeaders
      })
    ).rejects.toMatchObject({
      body: { message: expect.stringMatching(/not the recipient/i) }
    });
  });

  it("lets the invited email accept, even before verifying it (ADR 0007)", async () => {
    const auth = createTestAuth();
    const { invitation, organizationId } = await createPendingInvitation(auth);
    const recipientHeaders = await signUp(auth, "invited@example.com", "Invited");

    const accepted = await auth.api.acceptInvitation({
      body: { invitationId: invitation.id },
      headers: recipientHeaders
    });

    expect(accepted?.invitation.status).toBe("accepted");
    expect(accepted?.member.organizationId).toBe(organizationId);
  });
});
