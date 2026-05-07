import { describe, expect, it, vi } from "vitest";

import { createAuthTransport } from "./auth.transport";
import type { AuthSession } from "./auth.type";

function session(activeOrganizationId = "org-1"): AuthSession {
  return {
    activeOrganizationId,
    expiresAt: "2026-01-01T00:00:00.000Z",
    user: {
      id: "user-1",
      email: "user@example.com",
      name: "User"
    }
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

describe("createAuthTransport", () => {
  it("posts login and syncs a returned session token", async () => {
    const setSessionToken = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () =>
      jsonResponse({
        session: session(),
        sessionToken: "token-1"
      })
    );
    const transport = createAuthTransport({
      adapter: {
        baseUrl: "https://api.example.test",
        credentials: "include",
        fetch: fetcher,
        getSessionToken: async () => null,
        setSessionToken
      }
    });

    await expect(
      transport.loginWithPassword({
        email: "user@example.com",
        password: "secret"
      })
    ).resolves.toEqual(session());

    expect(fetcher).toHaveBeenCalledWith("https://api.example.test/api/auth/sign-in/email", {
      body: JSON.stringify({
        email: "user@example.com",
        password: "secret"
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
    expect(setSessionToken).toHaveBeenCalledWith("token-1");
  });

  it("calls adapter fetch without binding it to the adapter object", async () => {
    let wasBoundToAdapter = false;
    const adapter = {
      baseUrl: "",
      credentials: "include" as const,
      fetch: async function (this: unknown) {
        wasBoundToAdapter = this === adapter;
        return jsonResponse({
          session: session(),
          sessionToken: "token-1"
        });
      },
      getSessionToken: async () => null,
      setSessionToken: async () => undefined
    };
    const transport = createAuthTransport({
      adapter
    });

    await transport.loginWithPassword({
      email: "user@example.com",
      password: "secret"
    });

    expect(wasBoundToAdapter).toBe(false);
  });

  it("sends bearer headers for session reads and clears tokens on 204", async () => {
    const setSessionToken = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const transport = createAuthTransport({
      adapter: {
        baseUrl: "",
        credentials: "include",
        fetch: fetcher,
        getSessionToken: async () => "token-1",
        setSessionToken
      }
    });

    await expect(transport.getSession()).resolves.toBeNull();

    expect(fetcher).toHaveBeenCalledWith("/api/auth/get-session", {
      credentials: "include",
      headers: {
        authorization: "Bearer token-1"
      },
      method: "GET"
    });
    expect(setSessionToken).toHaveBeenCalledWith(null);
  });

  it("accepts cookie-only adapters when no token is available", async () => {
    const nextSession = session("org-2");
    const fetcher = vi.fn(async () =>
      jsonResponse({
        session: nextSession
      })
    );
    const transport = createAuthTransport({
      adapter: {
        baseUrl: "",
        credentials: "include",
        fetch: fetcher,
        getSessionToken: async () => null,
        setSessionToken: async () => undefined
      }
    });

    await expect(transport.setActiveOrganization("org-2")).resolves.toEqual(nextSession);

    expect(fetcher).toHaveBeenCalledWith("/api/auth/organization/set-active", {
      body: JSON.stringify({ organizationId: "org-2" }),
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  });

  it("throws a stable auth request error for non-success responses", async () => {
    const transport = createAuthTransport({
      adapter: {
        baseUrl: "https://api.example.test/",
        credentials: "include",
        fetch: async () => new Response("nope", { status: 401 }),
        getSessionToken: async () => null,
        setSessionToken: async () => undefined
      }
    });

    await expect(transport.listOrganizations()).rejects.toThrow("auth request failed (401)");
  });
});
