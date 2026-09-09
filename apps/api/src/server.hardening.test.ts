import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveApiRuntimeConfig } from "./server.config";

// The db client asserts DATABASE_URL at import time; no connection is made in
// this test. A rejected query never builds a context, and the queries that pass
// carry no session cookie and only touch the schema or the constant `health`
// field, so nothing below reaches a session lookup or a data resolver.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/server-test";
// better-auth reads the allowlist at import time and production config fails
// closed without one; pin it so a local .env override cannot change the setup.
process.env.API_CORS_ORIGINS = "http://localhost:5173";

const { createApiServer } = await import("./server");

const INTROSPECTION_QUERY = "{ __schema { types { name } } }";

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

async function withApiServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const { server, wsServer } = createApiServer({
    logger: createLogger({ name: "api-hardening-test", level: "silent" }),
    rateLimitConfig: { enabled: false, max: 1000, windowMs: 60000, trustProxy: false }
  });
  const baseUrl = await listen(server);

  try {
    await run(baseUrl);
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

function postGraphql(baseUrl: string, query: string): Promise<Response> {
  return fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ query })
  });
}

// `__Type.ofType` nests to any depth and resolves from the schema alone, so the
// probe needs neither a session nor the database. Introspection is on outside
// production, which is where the depth test runs.
function nestedQuery(depth: number): string {
  if (depth < 3) {
    throw new Error(`nestedQuery cannot go shallower than depth 3, got ${String(depth)}`);
  }

  let selection = "name";
  for (let level = 3; level < depth; level += 1) {
    selection = `ofType { ${selection} }`;
  }
  return `{ __schema { types { ${selection} } } }`;
}

// Every aliased field is one selection, so `fieldCount` aliases of the constant
// `health` field cost exactly `fieldCount`.
function wideHealthQuery(fieldCount: number): { query: string; data: Record<string, string> } {
  const aliases = Array.from({ length: fieldCount }, (_, index) => `h${String(index)}`);
  return {
    query: `{ ${aliases.map((alias) => `${alias}: health`).join(" ")} }`,
    data: Object.fromEntries(aliases.map((alias) => [alias, "ok"]))
  };
}

describe("createApiServer graphql hardening gates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("introspection", () => {
    it("rejects __schema in production with the override unset, but still serves a normal query", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("API_GRAPHQL_INTROSPECTION", undefined);

      await withApiServer(async (baseUrl) => {
        const rejected = await postGraphql(baseUrl, INTROSPECTION_QUERY);
        expect(rejected.status).toBe(400);
        const rejectedBody: unknown = await rejected.json();
        expect(rejectedBody).toMatchObject({
          errors: [{ message: "GraphQL introspection is disabled" }]
        });
        expect(rejectedBody).not.toHaveProperty("data");

        // Positive control: the same server still executes a non-introspection query.
        const allowed = await postGraphql(baseUrl, "{ health }");
        expect(allowed.status).toBe(200);
        await expect(allowed.json()).resolves.toEqual({ data: { health: "ok" } });
      });
    });

    it("serves __schema in production when API_GRAPHQL_INTROSPECTION forces it on", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("API_GRAPHQL_INTROSPECTION", "true");

      await withApiServer(async (baseUrl) => {
        const response = await postGraphql(baseUrl, INTROSPECTION_QUERY);
        expect(response.status).toBe(200);
        const body: unknown = await response.json();
        expect(body).not.toHaveProperty("errors");
        expect(body).toMatchObject({
          data: { __schema: { types: expect.arrayContaining([{ name: "Query" }]) } }
        });
      });
    });
  });

  describe("depth", () => {
    it("rejects a query nested past the configured max depth and accepts one at the limit", async () => {
      const { maxQueryDepth } = resolveApiRuntimeConfig(process.env);

      await withApiServer(async (baseUrl) => {
        const rejected = await postGraphql(baseUrl, nestedQuery(maxQueryDepth + 1));
        expect(rejected.status).toBe(400);
        const rejectedBody: unknown = await rejected.json();
        expect(rejectedBody).toMatchObject({
          errors: [{ message: `graphql query exceeds max depth ${String(maxQueryDepth)}` }]
        });
        expect(rejectedBody).not.toHaveProperty("data");

        const allowed = await postGraphql(baseUrl, nestedQuery(maxQueryDepth));
        expect(allowed.status).toBe(200);
        const allowedBody: unknown = await allowed.json();
        expect(allowedBody).not.toHaveProperty("errors");
        expect(allowedBody).toHaveProperty("data.__schema.types");
      });
    });
  });

  describe("complexity", () => {
    it("rejects a selection wider than the configured max complexity and accepts one at the limit", async () => {
      const { maxQueryComplexity } = resolveApiRuntimeConfig(process.env);

      await withApiServer(async (baseUrl) => {
        const rejected = await postGraphql(baseUrl, wideHealthQuery(maxQueryComplexity + 1).query);
        expect(rejected.status).toBe(400);
        const rejectedBody: unknown = await rejected.json();
        expect(rejectedBody).toMatchObject({
          errors: [
            { message: `graphql query exceeds max complexity ${String(maxQueryComplexity)}` }
          ]
        });
        expect(rejectedBody).not.toHaveProperty("data");

        const atLimit = wideHealthQuery(maxQueryComplexity);
        const allowed = await postGraphql(baseUrl, atLimit.query);
        expect(allowed.status).toBe(200);
        await expect(allowed.json()).resolves.toEqual({ data: atLimit.data });
      });
    });
  });
});
