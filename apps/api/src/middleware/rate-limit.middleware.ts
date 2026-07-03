import type { IncomingHttpHeaders } from "node:http";

type RuntimeEnv = Record<string, string | undefined>;

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_MS = 60000;
const BUCKET_SWEEP_THRESHOLD = 10000;
const MAX_BUCKETS = 100000;

export interface RateLimitConfig {
  enabled: boolean;
  max: number;
  trustProxy: boolean;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  firstRejection: boolean;
  retryAfterSeconds: number;
}

interface RateLimitBucket {
  count: number;
  windowStartMs: number;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function resolveRateLimitConfig(env: RuntimeEnv): RateLimitConfig {
  return {
    enabled: env.API_RATE_LIMIT_ENABLED !== "false" && env.NODE_ENV !== "test",
    max: parsePositiveInteger(env.API_RATE_LIMIT_MAX, DEFAULT_MAX_REQUESTS),
    trustProxy: env.API_TRUST_PROXY === "true",
    windowMs: parsePositiveInteger(env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS)
  };
}

// Single-instance in-memory limiter. For multi-instance deployments, replace
// the Map with a shared store (e.g. Redis) behind the same check() contract.
export function createRateLimiter(config: RateLimitConfig) {
  const buckets = new Map<string, RateLimitBucket>();
  let lastSweepMs = Number.NEGATIVE_INFINITY;

  function sweepStaleBuckets(nowMs: number): void {
    // Time-gated so a flood of distinct keys cannot buy an O(n) sweep on
    // every request: at most one full pass per window, and only once the
    // table is large enough to matter.
    if (buckets.size < BUCKET_SWEEP_THRESHOLD || nowMs - lastSweepMs < config.windowMs) {
      return;
    }

    lastSweepMs = nowMs;

    for (const [key, bucket] of buckets) {
      if (nowMs - bucket.windowStartMs >= config.windowMs) {
        buckets.delete(key);
      }
    }
  }

  return {
    check(key: string, nowMs: number = Date.now()): RateLimitDecision {
      if (!config.enabled) {
        return { allowed: true, firstRejection: false, retryAfterSeconds: 0 };
      }

      sweepStaleBuckets(nowMs);

      const bucket = buckets.get(key);

      if (!bucket || nowMs - bucket.windowStartMs >= config.windowMs) {
        // Hard cap on tracked keys: fail OPEN for new keys at the cap. An
        // attacker who fills the table must not be able to lock out
        // legitimate users, and the cap bounds memory either way.
        if (!bucket && buckets.size >= MAX_BUCKETS) {
          return { allowed: true, firstRejection: false, retryAfterSeconds: 0 };
        }

        buckets.set(key, { count: 1, windowStartMs: nowMs });
        return { allowed: true, firstRejection: false, retryAfterSeconds: 0 };
      }

      bucket.count += 1;

      if (bucket.count > config.max) {
        const retryAfterMs = bucket.windowStartMs + config.windowMs - nowMs;
        return {
          allowed: false,
          // True only when the bucket first crosses the limit in this window,
          // so callers can log rejections without the log becoming a flood.
          firstRejection: bucket.count === config.max + 1,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
        };
      }

      return { allowed: true, firstRejection: false, retryAfterSeconds: 0 };
    },
    size(): number {
      return buckets.size;
    }
  };
}

export function resolveRateLimitKey(
  req: {
    headers: IncomingHttpHeaders;
    socket: { remoteAddress?: string | undefined };
  },
  trustProxy: boolean
): string {
  if (trustProxy) {
    // Only the RIGHTMOST x-forwarded-for entry is proxy-controlled: the
    // template's nginx appends the real client IP, while any leftmost
    // entries arrive from the client and are trivially forgeable.
    const forwarded = req.headers["x-forwarded-for"];
    const flattened = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    const entries =
      flattened
        ?.split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0) ?? [];
    const rightmost = entries[entries.length - 1];

    if (rightmost) {
      return rightmost;
    }
  }

  return req.socket.remoteAddress ?? "unknown";
}
