import type { AuthClientConfig, AuthConfig } from "./auth.type";

/** Minimum BETTER_AUTH_SECRET length in production. */
export const PRODUCTION_AUTH_SECRET_MIN_LENGTH = 32;

const WEAK_PRODUCTION_SECRETS = new Set([
  "development-secret",
  "your-secret-key-change-in-production",
  "secret",
  "changeme",
  "password",
  "test-secret-test-secret-test-secret-1234"
]);

/**
 * Production secrets must be non-empty, long enough, and not a known placeholder.
 * Development may still use the short `development-secret` fallback.
 */
export function assertProductionAuthSecret(
  secret: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV
): void {
  if (nodeEnv !== "production") {
    return;
  }

  if (!secret || secret.trim().length === 0) {
    throw new Error("BETTER_AUTH_SECRET must be set in production");
  }

  if (secret.length < PRODUCTION_AUTH_SECRET_MIN_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET must be at least ${String(PRODUCTION_AUTH_SECRET_MIN_LENGTH)} characters in production`
    );
  }

  if (WEAK_PRODUCTION_SECRETS.has(secret) || WEAK_PRODUCTION_SECRETS.has(secret.toLowerCase())) {
    throw new Error(
      "BETTER_AUTH_SECRET must not use a known placeholder or development value in production"
    );
  }
}

export function getServerAuthConfig(
  env: Record<string, string | undefined> = process.env
): AuthConfig {
  return {
    baseUrl: env.BETTER_AUTH_URL ?? "http://localhost:4000",
    requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
    secret: env.BETTER_AUTH_SECRET ?? "development-secret"
  };
}

export function getClientAuthConfig(
  env: Record<string, string | undefined> = process.env
): AuthClientConfig {
  return {
    baseUrl: env.BETTER_AUTH_URL ?? "http://localhost:4000"
  };
}
