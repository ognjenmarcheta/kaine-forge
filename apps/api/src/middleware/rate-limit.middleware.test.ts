import { describe, expect, it } from "vitest";

import {
  createRateLimiter,
  resolveRateLimitConfig,
  resolveRateLimitKey
} from "./rate-limit.middleware";

describe("resolveRateLimitConfig", () => {
  it("is enabled by default outside test env with sane defaults", () => {
    const config = resolveRateLimitConfig({ NODE_ENV: "production" });
    expect(config).toEqual({ enabled: true, max: 100, windowMs: 60000 });
  });

  it("is disabled in test env and when explicitly turned off", () => {
    expect(resolveRateLimitConfig({ NODE_ENV: "test" }).enabled).toBe(false);
    expect(
      resolveRateLimitConfig({ NODE_ENV: "production", API_RATE_LIMIT_ENABLED: "false" }).enabled
    ).toBe(false);
  });

  it("reads max and window from env", () => {
    const config = resolveRateLimitConfig({
      NODE_ENV: "production",
      API_RATE_LIMIT_MAX: "5",
      API_RATE_LIMIT_WINDOW_MS: "1000"
    });
    expect(config.max).toBe(5);
    expect(config.windowMs).toBe(1000);
  });
});

describe("createRateLimiter", () => {
  it("allows up to max requests per window and then rejects with retry-after", () => {
    const limiter = createRateLimiter({ enabled: true, max: 2, windowMs: 1000 });

    expect(limiter.check("ip-1", 0).allowed).toBe(true);
    expect(limiter.check("ip-1", 10).allowed).toBe(true);

    const rejected = limiter.check("ip-1", 20);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window rolls over", () => {
    const limiter = createRateLimiter({ enabled: true, max: 1, windowMs: 1000 });

    expect(limiter.check("ip-1", 0).allowed).toBe(true);
    expect(limiter.check("ip-1", 500).allowed).toBe(false);
    expect(limiter.check("ip-1", 1001).allowed).toBe(true);
  });

  it("isolates keys", () => {
    const limiter = createRateLimiter({ enabled: true, max: 1, windowMs: 1000 });

    expect(limiter.check("ip-1", 0).allowed).toBe(true);
    expect(limiter.check("ip-2", 0).allowed).toBe(true);
  });

  it("always allows when disabled", () => {
    const limiter = createRateLimiter({ enabled: false, max: 1, windowMs: 1000 });

    expect(limiter.check("ip-1", 0).allowed).toBe(true);
    expect(limiter.check("ip-1", 1).allowed).toBe(true);
  });
});

describe("resolveRateLimitKey", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const key = resolveRateLimitKey({
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "9.9.9.9" }
    });
    expect(key).toBe("1.2.3.4");
  });

  it("falls back to the socket address", () => {
    const key = resolveRateLimitKey({ headers: {}, socket: { remoteAddress: "9.9.9.9" } });
    expect(key).toBe("9.9.9.9");
  });
});
