import type { ServerAuth } from "@repo/auth/auth.type";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createAuthRouteTransport } from "./auth.transport";
import type { AuthRouteContext } from "./auth.type";

interface MockResponse extends ServerResponse<IncomingMessage> {
  bodyText: string;
  headersMap: Record<string, string | string[]>;
}

function createRequest(params: {
  bodyText?: string;
  headers?: IncomingHttpHeaders;
  method: string;
  url: string;
}): IncomingMessage {
  const body = params.bodyText ? Buffer.from(params.bodyText) : null;

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
    getHeader(name: string) {
      return response.headersMap[name.toLowerCase()];
    },
    setHeader(name: string, value: string | string[]) {
      response.headersMap[name.toLowerCase()] = value;
      return response;
    }
  };

  return response as unknown as MockResponse;
}

function authContext(
  input: Pick<AuthRouteContext, "req" | "res"> & { auth?: Partial<ServerAuth> }
): AuthRouteContext {
  return {
    auth: {
      createOrganization: vi.fn(),
      getSessionFromHeaders: vi.fn(),
      listOrganizationMembersByScope: vi.fn(),
      listOrganizationsByScope: vi.fn(),
      loginWithPassword: vi.fn(),
      logout: vi.fn(),
      setActiveOrganization: vi.fn(),
      signUpWithPassword: vi.fn(),
      ...input.auth
    } as unknown as ServerAuth,
    req: input.req,
    res: input.res
  };
}

describe("createAuthRouteTransport", () => {
  it("applies CORS and maps invalid JSON to the existing auth error response", async () => {
    const previousCors = process.env.API_CORS_ORIGINS;
    process.env.API_CORS_ORIGINS = "https://app.example.test";
    const req = createRequest({
      bodyText: "{",
      headers: {
        origin: "https://app.example.test"
      },
      method: "POST",
      url: "/api/auth/sign-in/email"
    });
    const res = createResponse();

    try {
      const handled = await createAuthRouteTransport().dispatch(authContext({ req, res }));

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      expect(res.headersMap["access-control-allow-origin"]).toBe("https://app.example.test");
      expect((JSON.parse(res.bodyText) as Record<string, unknown>)["error"]).toContain("JSON");
    } finally {
      process.env.API_CORS_ORIGINS = previousCors;
    }
  });

  it("writes and clears the session cookie through transport helpers", async () => {
    const loginResult = {
      session: {
        activeOrganizationId: "org-1",
        expiresAt: "2026-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          id: "user-1",
          name: "User"
        }
      },
      sessionToken: "session token"
    };
    const auth = {
      loginWithPassword: vi.fn(async () => loginResult),
      logout: vi.fn(async () => undefined)
    };
    const transport = createAuthRouteTransport();
    const loginRes = createResponse();

    await transport.dispatch(
      authContext({
        auth,
        req: createRequest({
          bodyText: JSON.stringify({
            email: "user@example.com",
            password: "secret"
          }),
          method: "POST",
          url: "/api/auth/sign-in/email"
        }),
        res: loginRes
      })
    );

    expect(loginRes.headersMap["set-cookie"]).toContain("kaine_session=session%20token");

    const logoutRes = createResponse();
    await transport.dispatch(
      authContext({
        auth,
        req: createRequest({
          headers: {
            cookie: "kaine_session=session%20token"
          },
          method: "POST",
          url: "/api/auth/sign-out"
        }),
        res: logoutRes
      })
    );

    expect(logoutRes.statusCode).toBe(204);
    expect(logoutRes.headersMap["set-cookie"]).toContain("Max-Age=0");
    expect(auth.logout).toHaveBeenCalledWith("session token");
  });
});
