export const STORAGE_CONFIG = {
  defaultEntityType: "general",
  /** Upper bound for one background object delete after its row is gone. */
  objectDeleteTimeoutMs: 10_000,
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  }
} as const;
