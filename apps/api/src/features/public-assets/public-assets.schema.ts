export const publicAssetsTypeDefs = /* GraphQL */ `
  enum PublicAssetKind {
    avatar
    organization_logo
  }

  type PublicAssets {
    avatarUrl: String
    organizationLogoUrl: String
  }

  type PublicAssetUploadTicket {
    uploadUrl: String!
    stagingKey: String!
    expiresIn: Int!
  }

  input RequestPublicAssetUploadInput {
    kind: PublicAssetKind!
    mimeType: String!
    sizeBytes: Int!
  }

  extend type Query {
    publicAssets: PublicAssets!
  }

  extend type Mutation {
    requestPublicAssetUpload(input: RequestPublicAssetUploadInput!): PublicAssetUploadTicket!
    confirmPublicAssetUpload(kind: PublicAssetKind!, stagingKey: String!): PublicAssets!
  }
`;
