import type { AttachmentEntityType } from "@repo/db";

export const STORAGE_CONFIG = {
  image: {
    /** Concurrent image jobs per API process; others wait their turn. */
    concurrency: 2,
    /** Rejects decompression bombs before libvips allocates their pixels. */
    maxInputPixels: 24_000_000,
    thumbnailSize: 320,
    /** A thumbnail lives next to its Attachment's object under this suffix. */
    thumbnailKeySuffix: ".thumb.webp"
  },
  defaultEntityType: "general" satisfies AttachmentEntityType,
  /** Upper bound for one background object delete after its row is gone. */
  objectDeleteTimeoutMs: 10_000,
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  },
  sweep: {
    /** Rows one sweep query takes; a run repeats while a full batch makes progress. */
    batchSize: 100,
    defaultIntervalMs: 15 * 60 * 1000,
    /** How long past its upload URL's expiry a pending row waits before it counts as abandoned. */
    pendingGraceMs: 24 * 60 * 60 * 1000,
    /** pg advisory lock key, so only one API replica sweeps at a time. */
    advisoryLockKey: 7_461_201
  }
} as const;
