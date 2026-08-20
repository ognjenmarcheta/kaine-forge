import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBoundedDatabaseCheck,
  createHealthRouteTransport,
  type HealthRouteContext
} from "./health.transport";

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
  // eslint-disable-next-line anti-slop/no-chained-type-assertions -- the fakes model only the req/res fields the transport reads; fully typed node IncomingMessage/ServerResponse fakes are impractical
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

describe("createBoundedDatabaseCheck", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves and releases the client when the database responds in time", async () => {
    const release = vi.fn();
    const check = createBoundedDatabaseCheck({
      connect: vi.fn().mockResolvedValue({ release }),
      timeoutMs: 3000
    });

    await expect(check()).resolves.toBeUndefined();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rejects when the database connect hangs past the timeout", async () => {
    vi.useFakeTimers();
    const check = createBoundedDatabaseCheck({
      connect: () => new Promise(() => undefined),
      timeoutMs: 3000
    });

    const pending = check();
    const assertion = expect(pending).rejects.toThrow("database readiness check timed out");
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it("releases a client that connects only after the timeout fired", async () => {
    vi.useFakeTimers();
    const release = vi.fn();
    let resolveConnect: (client: { release: () => void }) => void = () => undefined;
    const check = createBoundedDatabaseCheck({
      connect: () =>
        new Promise<{ release: () => void }>((resolve) => {
          resolveConnect = resolve;
        }),
      timeoutMs: 3000
    });

    const pending = check();
    const assertion = expect(pending).rejects.toThrow("database readiness check timed out");
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;

    resolveConnect({ release });
    await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
