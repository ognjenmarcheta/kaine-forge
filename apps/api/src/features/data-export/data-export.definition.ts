export const DATA_EXPORT_CONFIG = {
  pagination: {
    defaultLimit: 10,
    maxLimit: 50
  },
  /** How long a ready archive stays downloadable before retention deletes it. */
  defaultArchiveTtlMs: 7 * 24 * 60 * 60 * 1000,
  archiveContentType: "application/zip",
  /**
   * Cap on an archive's JSON before compression. The job builds the whole
   * archive in memory, so a larger export fails with reason too_large instead
   * of exhausting the process (streaming is the upgrade: issue #753).
   */
  maxArchiveBytes: 256 * 1024 * 1024,
  /**
   * Private-bucket prefix of user export archives. An Organization export
   * lives under the Organization's own `<organizationId>/` prefix instead, so
   * the storage sweep removes it with a deleted Organization.
   */
  userKeyPrefix: "exports/users"
} as const;

/** The GraphQL error code of a second export request while one of that kind is in progress. */
export const DATA_EXPORT_IN_PROGRESS = "DATA_EXPORT_IN_PROGRESS";
