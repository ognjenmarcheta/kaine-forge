import type { IncomingHttpHeaders } from "node:http";

type RuntimeEnv = Record<string, string | undefined>;

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_MS = 60000;
const BUCKET_SWEEP_THRESHOLD = 10000;

export interface RateLimitConfig {
  enabled: boolean;
  max: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
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
    windowMs: parsePositiveInteger(env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS)
  };
}

// Single-instance in-memory limiter. For multi-instance deployments, replace
// the Map with a shared store (e.g. Redis) behind the same check() contract.
export function createRateLimiter(config: RateLimitConfig) {
  const buckets = new Map<string, RateLimitBucket>();

  function sweepStaleBuckets(nowMs: number): void {
    if (buckets.size < BUCKET_SWEEP_THRESHOLD) {
      return;
    }

    for (const [key, bucket] of buckets) {
      if (nowMs - bucket.windowStartMs >= config.windowMs) {
        buckets.delete(key);
      }
    }
  }

  return {
    check(key: string, nowMs: number = Date.now()): RateLimitDecision {
      if (!config.enabled) {
        return { allowed: true, retryAfterSeconds: 0 };
      }

      sweepStaleBuckets(nowMs);

      const bucket = buckets.get(key);

      if (!bucket || nowMs - bucket.windowStartMs >= config.windowMs) {
        buckets.set(key, { count: 1, windowStartMs: nowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      bucket.count += 1;

      if (bucket.count > config.max) {
        const retryAfterMs = bucket.windowStartMs + config.windowMs - nowMs;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
        };
      }

      return { allowed: true, retryAfterSeconds: 0 };
    }
  };
}

export function resolveRateLimitKey(req: {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string | undefined };
}): string {
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = firstForwarded?.split(",")[0]?.trim();

  return ip || req.socket.remoteAddress || "unknown";
}
