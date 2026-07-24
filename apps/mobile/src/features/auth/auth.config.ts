import { parseSocialProviders } from "@repo/auth/transport";

import { getMobileEnv } from "../../env.config";

export const AUTH_CONFIG = {
  baseUrl: getMobileEnv().EXPO_PUBLIC_API_URL,
  // Deep-link scheme must match apps/mobile app.json "scheme" and server
  // trustedOrigins (packages/auth EXPO_AUTH_SCHEME).
  scheme: "kaineforge",
  // UI-only gate for social login buttons; API env vars stay authoritative.
  socialProviders: parseSocialProviders(getMobileEnv().EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS)
} as const;
