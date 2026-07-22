import { parseSocialProviders } from "@repo/auth/transport";

export const AUTH_CONFIG = {
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000",
  // Deep-link scheme must match apps/mobile app.json "scheme" and server
  // trustedOrigins (packages/auth EXPO_AUTH_SCHEME).
  scheme: "kaineforge",
  // UI-only gate for social login buttons; API env vars stay authoritative.
  socialProviders: parseSocialProviders(process.env.EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS)
} as const;
