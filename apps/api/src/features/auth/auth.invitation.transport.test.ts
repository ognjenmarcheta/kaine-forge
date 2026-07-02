import type { ServerAuth } from "@repo/auth/auth.type";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { createAuthRouteTransport } from "./auth.transport";
import type { AuthRouteContext } from "./auth.type";

function createRequest(params: {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  const chunks = params.body === undefined ? [] : [Buffer.from(JSON.stringify(params.body))];
  const req = Readable.from(chunks) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = params.method;
  req.url = params.url;
  req.headers = { host: "localhost", ...params.headers };
  return req;
}

function createResponse() {
  const headers = new Map<string, unknown>();
  return {
    statusCode: 0,
    body: "",
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    end(chunk?: string) {
      this.body = chunk ?? "";
    }
  };
}

const session = {
  user: { id: "user-1", email: "admin@example.com", name: "Admin" },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  activeOrganizationId: "org-1"
};

function createAuthMock(overrides: Partial<ServerAuth> = {}): ServerAuth {
  return {
    getSessionFromHeaders: vi.fn().mockResolvedValue(session),
    loginWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    logout: vi.fn(),
    listOrganizationsByScope: vi.fn(),
    getCurrentOrganizationByScope: vi.fn(),
    getOrganizationMembershipProof: vi.fn(),
    setActiveOrganization: vi.fn(),
    createOrganization: vi.fn(),
    listOrganizationMembersByScope: vi.fn(),
    createInvitation: vi.fn(),
    listInvitationsByScope: vi.fn(),
    acceptInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    ...overrides
  } as ServerAuth;
}

async function dispatch(auth: ServerAuth, req: unknown, res: unknown): Promise<boolean> {
  const transport = createAuthRouteTransport();
  return transport.dispatch({ req, res, auth } as unknown as AuthRouteContext);
}

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
