import { describe, expect, it, vi } from "vitest";

import { resolveOrganizationScope, type OrganizationMembershipProof } from "./auth.scope";

const user = {
  email: "u1@example.com",
  emailVerified: false,
  id: "user-1",
  name: "User One"
};
const session = { activeOrganizationId: "org-1", expiresAt: "2026-02-26T00:00:00.000Z", user };
const ownMembership: OrganizationMembershipProof = {
  id: "membership-1",
  organizationId: "org-1",
  role: "owner",
  userId: "user-1"
};

describe("resolveOrganizationScope", () => {
  it.each([
    { name: "no Session", session: null, error: "authentication required" },
    {
      name: "a Session without an Active Organization",
      session: { ...session, activeOrganizationId: null },
      error: "active organization required"
    }
  ])("gives no scope for $name and says why on require", async ({ session, error }) => {
    const getMembership = vi.fn(async () => ownMembership);

    const resolution = await resolveOrganizationScope({ getMembership, session });

    expect(resolution.organizationScope).toBeNull();
    expect(() => resolution.requireOrganizationScope()).toThrowError(error);
    expect(getMembership).not.toHaveBeenCalled();
  });

  it("returns the Active Organization with its proven Organization Membership", async () => {
    const getMembership = vi.fn(async () => ownMembership);

    const resolution = await resolveOrganizationScope({ getMembership, session });

    const expected = {
      membership: { id: "membership-1", role: "owner", userId: "user-1" },
      organizationId: "org-1",
      user,
      userId: "user-1"
    };
    expect(resolution.organizationScope).toEqual(expected);
    expect(resolution.requireOrganizationScope()).toEqual(expected);
    expect(getMembership).toHaveBeenCalledWith({ organizationId: "org-1", userId: "user-1" });
  });

  it.each([
    { name: "no Organization Membership", membership: null },
    {
      name: "a membership proof for another organization",
      membership: { ...ownMembership, organizationId: "org-2" }
    }
  ])("rejects a Session with $name", async ({ membership }) => {
    await expect(
      resolveOrganizationScope({ getMembership: async () => membership, session })
    ).rejects.toThrowError("organization not accessible");
  });
});
