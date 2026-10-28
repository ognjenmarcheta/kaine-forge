import { describe, expect, it } from "vitest";

import {
  createRateLimiter,
  resolveRateLimitConfig,
  resolveRateLimitKey
} from "./rate-limit.middleware";

const ONE_HOP = { trustProxy: true, trustedProxyHops: 1 };

describe("resolveRateLimitConfig", () => {
  it("is enabled by default outside test env with sane defaults", () => {
    const config = resolveRateLimitConfig({ NODE_ENV: "production" });
    expect(config).toEqual({
      enabled: true,
      max: 100,
      trustedProxyHops: 1,
      trustProxy: false,
      windowMs: 60000
    });
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

  it("only trusts the proxy when API_TRUST_PROXY is exactly true", () => {
    expect(resolveRateLimitConfig({ API_TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(resolveRateLimitConfig({ API_TRUST_PROXY: "false" }).trustProxy).toBe(false);
    expect(resolveRateLimitConfig({}).trustProxy).toBe(false);
  });

  it.each([
    [undefined, 1],
    ["2", 2],
    ["0", 1],
    ["two", 1]
  ])("reads API_TRUSTED_PROXY_HOPS %s as %i hops", (value, hops) => {
    expect(resolveRateLimitConfig({ API_TRUSTED_PROXY_HOPS: value }).trustedProxyHops).toBe(hops);
  });
});

describe("createRateLimiter", () => {
  it("allows up to max requests per window and then rejects with retry-after", () => {
    const limiter = createRateLimiter({
      enabled: true,
      max: 2,
      windowMs: 1000,
      trustProxy: false,
      trustedProxyHops: 1
    });

    expect(limiter.check("ip-1", 0).allowed).toBe(true);
    expect(limiter.check("ip-1", 10).allowed).toBe(true);

    const rejected = limiter.check("ip-1", 20);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window rolls over", () => {
    const limiter = createRateLimiter({
      enabled: true,
      max: 1,
      windowMs: 1000,
      trustProxy: false,
      trustedProxyHops: 1
    });

    expect(limiter.check("ip-1", 0).allowed).toBe(true);
    expect(limiter.check("ip-1", 500).allowed).toBe(false);
    expect(limiter.check("ip-1", 1001).allowed).toBe(true);
  });

  it("isolates keys", () => {
    const limiter = createRateLimiter({
      enabled: true,
      max: 1,
      windowMs: 1000,
      trustProxy: false,
      trustedProxyHops: 1
    });

    expect(limiter.check("ip-1", 0).allowed).toBe(true);
    expect(limiter.check("ip-2", 0).allowed).toBe(true);
  });

  it("always allows when disabled", () => {
    const limiter = createRateLimiter({
      enabled: false,
      max: 1,
      windowMs: 1000,
      trustProxy: false,
      trustedProxyHops: 1
    });

    expect(limiter.check("ip-1", 0).allowed).toBe(true);
    expect(limiter.check("ip-1", 1).allowed).toBe(true);
  });

  it("flags only the first rejection in a window", () => {
    const limiter = createRateLimiter({
      enabled: true,
      max: 1,
      windowMs: 1000,
      trustProxy: false,
      trustedProxyHops: 1
    });

    expect(limiter.check("ip-1", 0).firstRejection).toBe(false);

    const first = limiter.check("ip-1", 10);
    expect(first.allowed).toBe(false);
    expect(first.firstRejection).toBe(true);

    const second = limiter.check("ip-1", 20);
    expect(second.allowed).toBe(false);
    expect(second.firstRejection).toBe(false);
  });

  it("time-gates the stale-bucket sweep to once per window", () => {
    const limiter = createRateLimiter({
      enabled: true,
      max: 5,
      windowMs: 1000,
      trustProxy: false,
      trustedProxyHops: 1
    });

    // Fill to the sweep threshold; every bucket's window starts at t=0.
    for (let i = 0; i < 10000; i += 1) {
      limiter.check(`stale-${String(i)}`, 0);
    }

    // First check at threshold runs a sweep (nothing stale yet) and arms the
    // gate at t=900.
    limiter.check("armed", 900);
    expect(limiter.size()).toBe(10001);

    // t=1500: the t=0 buckets are stale, but the gate (t=900 + window) has
    // not elapsed, so the sweep is skipped and stale buckets remain.
    limiter.check("gated", 1500);
    expect(limiter.size()).toBe(10002);

    // t=1900: gate elapsed; stale buckets are swept ("gated" survives).
    limiter.check("swept", 1900);
    expect(limiter.size()).toBe(2);
  });

  it("fails open for new keys once the bucket cap is reached", () => {
    const limiter = createRateLimiter({
      enabled: true,
      max: 1,
      windowMs: 60000,
      trustProxy: false,
      trustedProxyHops: 1
    });

    for (let i = 0; i < 100000; i += 1) {
      limiter.check(`key-${String(i)}`, 0);
    }
    expect(limiter.size()).toBe(100000);

    // A new key at the cap is allowed without being tracked: bounded memory,
    // and a table-filling attacker cannot lock out legitimate users.
    expect(limiter.check("overflow", 1).allowed).toBe(true);
    expect(limiter.size()).toBe(100000);

    // Existing keys keep being limited normally at the cap.
    expect(limiter.check("key-0", 2).allowed).toBe(false);
  });
});

describe("resolveRateLimitKey", () => {
  it("ignores x-forwarded-for entirely when the proxy is not trusted", () => {
    const key = resolveRateLimitKey(
      {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
        socket: { remoteAddress: "9.9.9.9" }
      },
      { trustProxy: false, trustedProxyHops: 1 }
    );
    expect(key).toBe("9.9.9.9");
  });

  it("uses the rightmost x-forwarded-for entry when the proxy is trusted", () => {
    // The template's nginx appends the real client IP, so the rightmost
    // entry is proxy-controlled while leftmost entries are client-forgeable.
    const key = resolveRateLimitKey(
      {
        headers: { "x-forwarded-for": "spoofed, 9.9.9.9" },
        socket: { remoteAddress: "10.0.0.1" }
      },
      ONE_HOP
    );
    expect(key).toBe("9.9.9.9");
  });

  it("handles array-form x-forwarded-for headers", () => {
    const key = resolveRateLimitKey(
      {
        headers: { "x-forwarded-for": ["spoofed, 1.1.1.1", "2.2.2.2"] },
        socket: { remoteAddress: "10.0.0.1" }
      },
      ONE_HOP
    );
    expect(key).toBe("2.2.2.2");
  });

  it("falls back to the socket address, then unknown", () => {
    expect(
      resolveRateLimitKey({ headers: {}, socket: { remoteAddress: "9.9.9.9" } }, ONE_HOP)
    ).toBe("9.9.9.9");
    expect(resolveRateLimitKey({ headers: {}, socket: {} }, ONE_HOP)).toBe("unknown");
  });

  // Traefik -> web nginx -> API: Traefik appends the client, nginx appends Traefik.
  it.each([
    ["203.0.113.5, 10.0.1.12", "203.0.113.5"],
    ["forged, 203.0.113.5, 10.0.1.12", "203.0.113.5"]
  ])("with two hops, takes the second entry from the right of %s", (header, expected) => {
    const key = resolveRateLimitKey(
      { headers: { "x-forwarded-for": header }, socket: { remoteAddress: "10.0.1.20" } },
      { trustProxy: true, trustedProxyHops: 2 }
    );
    expect(key).toBe(expected);
  });

  it("falls back to the socket address when the header has fewer entries than hops", () => {
    // A client that reaches nginx directly sends one entry; it must not become the key.
    const key = resolveRateLimitKey(
      { headers: { "x-forwarded-for": "198.51.100.66" }, socket: { remoteAddress: "10.0.1.20" } },
      { trustProxy: true, trustedProxyHops: 2 }
    );
    expect(key).toBe("10.0.1.20");
  });
});
