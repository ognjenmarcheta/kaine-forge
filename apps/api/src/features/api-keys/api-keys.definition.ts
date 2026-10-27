import { AUTH_DEFINITIONS } from "@repo/auth/auth.definition";

export const API_KEYS_CONFIG = {
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  },
  /** The request header that carries an API Key. */
  header: "x-api-key",
  /** The shape of every key the auth add-on generates: the prefix, then letters only. */
  pattern: new RegExp(
    `^${AUTH_DEFINITIONS.API_KEY_PREFIX}[A-Za-z]{${String(AUTH_DEFINITIONS.API_KEY_LENGTH)}}$`
  )
} as const;
