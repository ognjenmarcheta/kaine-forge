// Query keys of the session user's account data; they do not depend on the
// Active Organization.
export const ACCOUNT_QUERY_KEYS = {
  accounts: ["account", "accounts"],
  sessions: ["account", "sessions"],
  socialProviders: ["account", "social-providers"]
} as const;
