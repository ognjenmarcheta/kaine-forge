import { describe, expect, it, vi } from "vitest";

import { createHealthRouteTransport, type HealthRouteContext } from "./health.transport";

function createResponse() {
  return {
    statusCode: 0,
    body: "",
    setHeader: vi.fn(),
    end(chunk?: string) {
      this.body = chunk ?? "";
    }
  };
}

function createContext(method: string, url: string) {
  const res = createResponse();
  const ctx = { req: { method, url }, res } as unknown as HealthRouteContext;
  return { ctx, res };
}

describe("health transport", () => {
  it("answers GET /health without touching the database", async () => {
    const checkDatabase = vi.fn();
    const transport = createHealthRouteTransport({ checkDatabase });
    const { ctx, res } = createContext("GET", "/health");

    const handled = await transport.dispatch(ctx);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ok" });
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it("matches /health with a query string", async () => {
    const transport = createHealthRouteTransport({ checkDatabase: vi.fn() });
    const { ctx, res } = createContext("GET", "/health?probe=1");

    expect(await transport.dispatch(ctx)).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it("answers GET /ready with 200 when the database responds", async () => {
    const transport = createHealthRouteTransport({
      checkDatabase: vi.fn().mockResolvedValue(undefined)
    });
    const { ctx, res } = createContext("GET", "/ready");

    expect(await transport.dispatch(ctx)).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ready" });
  });

  it("answers GET /ready with 503 when the database is unreachable", async () => {
    const transport = createHealthRouteTransport({
      checkDatabase: vi.fn().mockRejectedValue(new Error("down"))
    });
    const { ctx, res } = createContext("GET", "/ready");

    expect(await transport.dispatch(ctx)).toBe(true);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ status: "unavailable" });
  });

  it("ignores other paths and methods", async () => {
    const transport = createHealthRouteTransport({ checkDatabase: vi.fn() });

    expect(await transport.dispatch(createContext("GET", "/graphql").ctx)).toBe(false);
    expect(await transport.dispatch(createContext("POST", "/health").ctx)).toBe(false);
  });
});
