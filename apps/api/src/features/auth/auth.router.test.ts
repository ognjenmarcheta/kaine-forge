import type { ServerAuth } from "@repo/auth/auth.type";
import type { IncomingMessage, IncomingHttpHeaders, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { handleAuthRoute } from "./auth.router";
import type { AuthRouteContext } from "./auth.type";

interface AuthMock {
  createOrganization: ReturnType<typeof vi.fn>;
  getMembers: ReturnType<typeof vi.fn>;
  getSessionFromHeaders: ReturnType<typeof vi.fn>;
  listOrganizations: ReturnType<typeof vi.fn>;
  loginWithPassword: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  setActiveOrganization: ReturnType<typeof vi.fn>;
  signUpWithPassword: ReturnType<typeof vi.fn>;
}

interface MockResponse extends ServerResponse<IncomingMessage> {
  bodyText: string;
  headersMap: Record<string, string | string[]>;
}

function createRequest(params: {
  body?: Record<string, unknown>;
  headers?: IncomingHttpHeaders;
  method: string;
  url: string;
}): IncomingMessage {
  const body = params.body ? Buffer.from(JSON.stringify(params.body)) : null;

  return {
    headers: {
      host: "localhost:4000",
      ...params.headers
    },
    method: params.method,
    url: params.url,
    async *[Symbol.asyncIterator]() {
      if (body) {
        yield body;
      }
    }
  } as IncomingMessage;
}

function createResponse(): MockResponse {
  const response = {
    bodyText: "",
    headersMap: {} as Record<string, string | string[]>,
    statusCode: 200,
    end(chunk?: string | Buffer) {
      if (typeof chunk === "string") {
        response.bodyText += chunk;
      } else if (chunk) {
        response.bodyText += chunk.toString("utf8");
      }

      return response;
    },
    setHeader(name: string, value: string | string[]) {
      response.headersMap[name.toLowerCase()] = value;
      return response;
    }
  };

  return response as unknown as MockResponse;
}

function parseResponseJson(response: MockResponse): Record<string, unknown> {
  return JSON.parse(response.bodyText) as Record<string, unknown>;
}

function createAuthMock(): AuthMock {
  return {
    createOrganization: vi.fn(),
    getMembers: vi.fn(),
    getSessionFromHeaders: vi.fn(),
    listOrganizations: vi.fn(),
    loginWithPassword: vi.fn(),
    logout: vi.fn(),
    setActiveOrganization: vi.fn(),
    signUpWithPassword: vi.fn()
  };
}

describe("auth.router", () => {
  it("rejects unauthenticated create-organization requests", async () => {
    const auth = createAuthMock();
    const req = createRequest({
      method: "POST",
      url: "/api/auth/organization/create",
      body: { name: "Acme" }
    });
    const res = createResponse();

    vi.mocked(auth.getSessionFromHeaders).mockResolvedValue(null);

    const handled = await handleAuthRoute({
      auth: auth as unknown as ServerAuth,
      req,
      res
    } as AuthRouteContext);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(401);
    expect(parseResponseJson(res)).toEqual({
      error: "authentication required"
    });
  });

  it("validates organization name for create route", async () => {
    const auth = createAuthMock();
    const req = createRequest({
      method: "POST",
      url: "/api/auth/organization/create",
      body: {}
    });
    const res = createResponse();

    vi.mocked(auth.getSessionFromHeaders).mockResolvedValue({
      activeOrganizationId: "org-1",
      expiresAt: "2026-02-26T00:00:00.000Z",
      user: {
        email: "test@test.test",
        id: "user-1",
        name: "Test User"
      }
    });

    const handled = await handleAuthRoute({
      auth: auth as unknown as ServerAuth,
      req,
      res
    } as AuthRouteContext);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(parseResponseJson(res)).toEqual({
      error: "name is required"
    });
  });

  it("creates organization and sets it active for current session", async () => {
    const auth = createAuthMock();
    const req = createRequest({
      method: "POST",
      url: "/api/auth/organization/create",
      headers: {
        cookie: "kaine_session=session-token"
      },
      body: { name: " Acme Workspace " }
    });
    const res = createResponse();

    vi.mocked(auth.getSessionFromHeaders).mockResolvedValue({
      activeOrganizationId: "org-1",
      expiresAt: "2026-02-26T00:00:00.000Z",
      user: {
        email: "test@test.test",
        id: "user-1",
        name: "Test User"
      }
    });
    vi.mocked(auth.createOrganization).mockResolvedValue({
      activeOrganizationId: "org-2",
      expiresAt: "2026-02-26T00:00:00.000Z",
      user: {
        email: "test@test.test",
        id: "user-1",
        name: "Test User"
      }
    });

    const handled = await handleAuthRoute({
      auth: auth as unknown as ServerAuth,
      req,
      res
    } as AuthRouteContext);

    expect(handled).toBe(true);
    expect(auth.createOrganization).toHaveBeenCalledWith({
      name: "Acme Workspace",
      sessionToken: "session-token",
      userId: "user-1"
    });
    expect(res.statusCode).toBe(200);
    expect(parseResponseJson(res)).toEqual({
      session: {
        activeOrganizationId: "org-2",
        expiresAt: "2026-02-26T00:00:00.000Z",
        user: {
          email: "test@test.test",
          id: "user-1",
          name: "Test User"
        }
      }
    });
  });
});
