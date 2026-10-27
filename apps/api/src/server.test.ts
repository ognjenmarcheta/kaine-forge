import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";

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
      expect(second.headers.get("access-control-expose-headers")).toBe("retry-after, x-request-id");
      expect(second.headers.get("x-request-id")).toMatch(UUID_PATTERN);
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface CompletionLine {
  level: number;
  msg: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

async function withLoggedApiServer(
  run: (baseUrl: string, completionLines: () => CompletionLine[]) => Promise<void>
): Promise<void> {
  // The better-auth mount test above deletes the allowlist when it finishes.
  process.env.API_CORS_ORIGINS = "http://localhost:5173";
  const lines: CompletionLine[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      for (const line of chunk.toString().split("\n")) {
        if (line === "") continue;
        // SAFETY: pino writes one JSON object per line; the filter below keeps
        // only completion lines, whose fields the assertions read.
        const parsed = JSON.parse(line) as CompletionLine;
        if (parsed.msg === "request completed") lines.push(parsed);
      }
      callback();
    }
  });
  const { server, wsServer } = createApiServer({
    logger: pino({ level: "debug" }, stream),
    rateLimitConfig: { enabled: false, max: 1000, windowMs: 60000, trustProxy: false }
  });
  const baseUrl = await listen(server);

  try {
    await run(baseUrl, () => lines);
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
}

// The completion line is written when the socket closes, which can land just
// after fetch resolves on the response headers.
async function completionLineFor(
  completionLines: () => CompletionLine[],
  requestId: string | null
): Promise<CompletionLine> {
  return vi.waitFor(() => {
    const line = completionLines().find((candidate) => candidate.requestId === requestId);
    if (!line) throw new Error(`no completion line for request id ${String(requestId)}`);
    return line;
  });
}

describe("createApiServer request ids", () => {
  it("echoes a valid incoming x-request-id and logs status and duration under it", async () => {
    await withLoggedApiServer(async (baseUrl, completionLines) => {
      const response = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-request-id": "client.Trace_42-a"
        },
        body: JSON.stringify({ query: "{ health }" })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("client.Trace_42-a");
      expect(response.headers.get("access-control-expose-headers")).toContain("x-request-id");

      const line = await completionLineFor(completionLines, "client.Trace_42-a");
      expect(line).toMatchObject({ level: 30, method: "POST", path: "/graphql", status: 200 });
      expect(line.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  it.each([
    ["longer than 128 characters", "a".repeat(200)],
    ["containing characters outside [A-Za-z0-9._-]", "bad id!"]
  ])("replaces an incoming id %s with a generated UUID", async (_case, incomingId) => {
    await withLoggedApiServer(async (baseUrl, completionLines) => {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { "x-request-id": incomingId }
      });

      const requestId = response.headers.get("x-request-id");
      expect(requestId).toMatch(UUID_PATTERN);
      await completionLineFor(completionLines, requestId);
    });
  });

  it("assigns an id to better-auth routes and exposes it to allowlisted origins", async () => {
    await withLoggedApiServer(async (baseUrl, completionLines) => {
      const response = await fetch(`${baseUrl}/api/auth/get-session`, {
        headers: { accept: "application/json", origin: "http://localhost:5173" }
      });

      const requestId = response.headers.get("x-request-id");
      expect(requestId).toMatch(UUID_PATTERN);
      expect(response.headers.get("access-control-expose-headers")).toContain("x-request-id");

      const line = await completionLineFor(completionLines, requestId);
      expect(line).toMatchObject({ path: "/api/auth/get-session", status: 200 });
    });
  });

  it("logs /health completion at debug so health probes stay out of info logs", async () => {
    await withLoggedApiServer(async (baseUrl, completionLines) => {
      const response = await fetch(`${baseUrl}/health`);

      const line = await completionLineFor(completionLines, response.headers.get("x-request-id"));
      expect(line).toMatchObject({ level: 20, path: "/health", status: 200 });
    });
  });
});
