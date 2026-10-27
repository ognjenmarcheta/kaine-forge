export const API_KEYS_CONFIG = {
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  },
  /** The request header that carries an API Key. */
  header: "x-api-key"
} as const;
