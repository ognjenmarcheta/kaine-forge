export const SYNC_CONFIG = {
  /** Changes one pull returns. */
  pull: { defaultLimit: 200, maxLimit: 500 },
  /** Rows of each list a first pull with a window returns, newest first (issue #800). */
  window: { defaultLimit: 500, maxLimit: 1000 },
  /** Rows one `syncPullOlder` page returns. */
  older: { defaultLimit: 200, maxLimit: 500 },
  /** Mutations one push may carry; a client sends a longer Outbox in several pushes. */
  maxPushMutations: 100,
  /** Longest idempotency key a push may carry, matching the receipts column. */
  maxIdempotencyKeyLength: 128
} as const;
