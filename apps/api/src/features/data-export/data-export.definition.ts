export const DATA_EXPORT_CONFIG = {
  pagination: {
    defaultLimit: 10,
    maxLimit: 50
  },
  /** How long a ready archive stays downloadable before retention deletes it. */
  defaultArchiveTtlMs: 7 * 24 * 60 * 60 * 1000,
  archiveContentType: "application/zip",
  /**
   * Private-bucket prefix of user export archives. An Organization export
   * lives under the Organization's own `<organizationId>/` prefix instead, so
   * the storage sweep removes it with a deleted Organization.
   */
  userKeyPrefix: "exports/users"
} as const;

/** The GraphQL error code of a second export request while one of that kind is in progress. */
export const DATA_EXPORT_IN_PROGRESS = "DATA_EXPORT_IN_PROGRESS";
