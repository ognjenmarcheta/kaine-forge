export const DATA_EXPORT_CONFIG = {
  pagination: {
    defaultLimit: 10,
    maxLimit: 50
  },
  /** How long a ready archive stays downloadable before retention deletes it. */
  defaultArchiveTtlMs: 7 * 24 * 60 * 60 * 1000,
  archiveContentType: "application/zip",
  /**
   * Cap on an archive's JSON before compression. The job streams the archive,
   * so memory does not grow with it; the cap bounds the job's run time, which
   * pg-boss ends after 15 minutes. A larger export fails with reason too_large.
   */
  maxArchiveBytes: 4 * 1024 ** 3,
  /** Cap on the compressed archive: GraphQL reports its size as a 32-bit Int. */
  maxZipBytes: 2 ** 31 - 1,
  /** Rows the job reads per query, for each list in an archive. */
  pageSize: 1000,
  /**
   * Private-bucket prefix of user export archives. An Organization export
   * lives under the Organization's own `<organizationId>/` prefix instead, so
   * the storage sweep removes it with a deleted Organization.
   */
  userKeyPrefix: "exports/users"
} as const;

/** The GraphQL error code of a second export request while one of that kind is in progress. */
export const DATA_EXPORT_IN_PROGRESS = "DATA_EXPORT_IN_PROGRESS";
