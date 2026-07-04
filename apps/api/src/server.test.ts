import { createLogger } from "@repo/logger";
import { describe, expect, it } from "vitest";

// The db client asserts DATABASE_URL at import time; no connection is made in
// this test (the request below never touches a resolver).
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/server-test";

const { createApiServer } = await import("./server");

describe("createApiServer rate limiting", () => {
  it("returns a CORS-readable 429 once the limit is exceeded, but never for preflights", async () => {
    const { server, wsServer } = createApiServer({
      logger: createLogger({ name: "api-test", level: "silent" }),
      rateLimitConfig: { enabled: true, max: 1, windowMs: 60000, trustProxy: false }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected server to listen on a port");
    }
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

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
