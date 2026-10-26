export const storageTypeDefs = /* GraphQL */ `
  enum FileStatus {
    pending
    uploaded
    deleted
  }

  enum AttachmentEntityType {
    general
    todo
  }

  type FileInfo {
    id: ID!
    key: String!
    bucket: String!
    originalName: String!
    mimeType: String!
    sizeBytes: Int!
    status: FileStatus!
    entityType: AttachmentEntityType
    entityId: ID
    downloadUrl: String
    thumbnailUrl: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type PresignedUploadResponse {
    fileId: ID!
    uploadUrl: String!
    key: String!
    expiresIn: Int!
  }

  input RequestUploadInput {
    originalName: String!
    mimeType: String!
    sizeBytes: Int!
    entityType: AttachmentEntityType
    entityId: ID
  }

  input FilesFilterInput {
    entityType: AttachmentEntityType
    entityId: ID
    status: FileStatus
    limit: Int
    offset: Int
  }

  extend type Query {
    file(id: ID!): FileInfo
    files(filter: FilesFilterInput): [FileInfo!]!
  }

  extend type Mutation {
    requestUploadUrl(input: RequestUploadInput!): PresignedUploadResponse!
    confirmUpload(fileId: ID!): FileInfo!
    deleteFile(fileId: ID!): Boolean!
  }
`;
