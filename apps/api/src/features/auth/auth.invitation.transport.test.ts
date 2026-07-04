import { describe, expect, it, vi } from "vitest";

import {
  createAuthMock,
  createRequest,
  createResponse,
  dispatch,
  session
} from "./auth.transport.test-helpers";

describe("invitation routes", () => {
  it("creates an invitation for the active organization", async () => {
    const auth = createAuthMock({
      createInvitation: vi.fn().mockResolvedValue({
        id: "inv-1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        expiresAt: "2026-07-09T00:00:00.000Z"
      })
    });
    const res = createResponse();

    const handled = await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/organization/invitation/create",
        body: { email: "new@example.com", role: "member" }
      }),
      res
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(auth.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        role: "member",
        scope: expect.objectContaining({ organizationId: "org-1", userId: "user-1" })
      })
    );
    expect(JSON.parse(res.body)).toMatchObject({ invitation: { id: "inv-1" } });
  });

  it("requires authentication to create an invitation", async () => {
    const auth = createAuthMock({
      getSessionFromHeaders: vi.fn().mockResolvedValue(null)
    });
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/organization/invitation/create",
        body: { email: "new@example.com", role: "member" }
      }),
      res
    );

    expect(res.statusCode).toBe(401);
  });

  it("accepts an invitation for the authenticated user", async () => {
    const auth = createAuthMock();
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/organization/invitation/accept",
        body: { invitationId: "inv-1" }
      }),
      res
    );

    expect(res.statusCode).toBe(204);
    expect(auth.acceptInvitation).toHaveBeenCalledWith({
      invitationId: "inv-1",
      user: session.user
    });
  });

  it("revokes an invitation in the active organization", async () => {
    const auth = createAuthMock();
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/organization/invitation/revoke",
        body: { invitationId: "inv-1" }
      }),
      res
    );

    expect(res.statusCode).toBe(204);
    expect(auth.revokeInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: "inv-1" })
    );
  });

  it("maps domain errors to 400", async () => {
    const auth = createAuthMock({
      acceptInvitation: vi.fn().mockRejectedValue(new Error("invitation expired"))
    });
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/organization/invitation/accept",
        body: { invitationId: "inv-1" }
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "invitation expired" });
  });
});
