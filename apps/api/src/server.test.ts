import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { describe, expect, it } from "vitest";

// The db client asserts DATABASE_URL at import time; no connection is made in
// this test (the requests below never touch a resolver or a session lookup).
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/server-test";
// The CORS allowlist is read from the environment at import time; pin it so a
// local .env override cannot change what this test asserts.
process.env.API_CORS_ORIGINS = "http://localhost:5173";

const { createApiServer } = await import("./server");

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected server to listen on a port");
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

describe("createApiServer rate limiting", () => {
  it("returns a CORS-readable 429 once the limit is exceeded, but never for preflights", async () => {
    const { server, wsServer } = createApiServer({
      logger: createLogger({ name: "api-test", level: "silent" }),
      rateLimitConfig: { enabled: true, max: 1, windowMs: 60000, trustProxy: false }
    });

    const baseUrl = await listen(server);

    try {
      const first = await fetch(`${baseUrl}/graphql`, {
        headers: { accept: "application/json" }
      });
      expect(first.status).not.toBe(429);

      const second = await fetch(`${baseUrl}/graphql`, {
        headers: { accept: "application/json", origin: "http://localhost:5173" }
      });
      expect(second.status).toBe(429);
      expect(Number(second.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
      expect(second.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
      expect(second.headers.get("access-control-allow-credentials")).toBe("true");
      expect(second.headers.get("access-control-expose-headers")).toBe("retry-after");
      await expect(second.json()).resolves.toEqual({ error: "too many requests" });

      // Preflights must never consume or hit the limit.
      const preflight = await fetch(`${baseUrl}/graphql`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "POST"
        }
      });
      expect(preflight.status).not.toBe(429);
    } finally {
      wsServer.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});

describe("createApiServer better-auth mount", () => {
  it("serves /api/auth/* through better-auth and answers preflights with CORS headers", async () => {
    process.env.API_CORS_ORIGINS = "http://localhost:5173";

    const { server, wsServer } = createApiServer({
      logger: createLogger({ name: "api-test", level: "silent" }),
      rateLimitConfig: { enabled: false, max: 1000, windowMs: 60000, trustProxy: false }
    });
    const baseUrl = await listen(server);

    try {
      // No session cookie: better-auth's get-session answers 200 with a JSON
      // null body and never touches the database.
      const session = await fetch(`${baseUrl}/api/auth/get-session`, {
        headers: { accept: "application/json" }
      });
      expect(session.status).toBe(200);
      await expect(session.json()).resolves.toBeNull();

      // Preflights short-circuit before the handler with the allowlisted
      // origin reflected (better-auth emits no CORS headers itself).
      const preflight = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type"
        }
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
      expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
      expect(preflight.headers.get("access-control-allow-headers")).toContain("authorization");
      expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");

      // Origins outside the allowlist get no CORS grant.
      const denied = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: "OPTIONS",
        headers: {
          origin: "http://evil.example.com",
          "access-control-request-method": "POST"
        }
      });
      expect(denied.headers.get("access-control-allow-origin")).toBeNull();
      // Denied responses still vary by Origin so caches never store an
      // origin-blind response.
      expect(denied.headers.get("vary")).toBe("Origin");
    } finally {
      delete process.env.API_CORS_ORIGINS;
      wsServer.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
