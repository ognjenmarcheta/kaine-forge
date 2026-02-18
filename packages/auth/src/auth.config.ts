import type { AuthClientConfig, AuthConfig } from "./auth.type";

export function getServerAuthConfig(): AuthConfig {
  return {
    baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
    secret: process.env.BETTER_AUTH_SECRET ?? "development-secret"
  };
}

export function getClientAuthConfig(): AuthClientConfig {
  return {
    baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:4000"
  };
}
