import { parseSocialProviders } from "@repo/auth/transport";

import { getWebEnv } from "../../env.config";

export const AUTH_CONFIG = {
  // Empty base url keeps auth requests same-origin so the Vite dev proxy and
  // production reverse proxy forward /api/auth/* to the API.
  baseUrl: "",
  // UI-only gate for social login buttons; the API's provider env vars stay
  // authoritative for which providers actually work.
  socialProviders: parseSocialProviders(getWebEnv().VITE_AUTH_SOCIAL_PROVIDERS)
} as const;
