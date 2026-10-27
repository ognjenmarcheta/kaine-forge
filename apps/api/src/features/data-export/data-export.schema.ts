export const dataExportTypeDefs = /* GraphQL */ `
  enum DataExportKind {
    # The caller's own data.
    user
    # The Active Organization's data. Requires organization:export.
    organization
  }

  enum DataExportStatus {
    pending
    running
    ready
    failed
    expired
  }

  type DataExport {
    id: ID!
    kind: DataExportKind!
    status: DataExportStatus!
    # Archive size; set while the export is ready.
    sizeBytes: Int
    createdAt: DateTime!
    completedAt: DateTime
    # When the archive is deleted; set once the export is ready.
    expiresAt: DateTime
  }

  type DataExportConnection {
    items: [DataExport!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    # The caller's own exports of this kind, newest first. The organization
    # kind lists only exports of the Active Organization.
    dataExports(kind: DataExportKind!, first: Int, after: String): DataExportConnection!
  }

  extend type Mutation {
    # Queues an export. One pending or running export of each kind at a time;
    # a second request fails with code DATA_EXPORT_IN_PROGRESS.
    requestDataExport(kind: DataExportKind!): DataExport!
    # A short-lived download URL of a ready export the caller requested.
    dataExportDownloadUrl(id: ID!): String!
  }
`;
