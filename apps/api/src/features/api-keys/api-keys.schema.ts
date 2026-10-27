export const apiKeysTypeDefs = /* GraphQL */ `
  type ApiKeyCreator {
    id: ID!
    name: String!
    email: String!
  }

  type ApiKey {
    id: ID!
    name: String!
    # The first characters of the key, so people can tell keys apart.
    prefix: String!
    # Null when the creator's account no longer exists.
    createdBy: ApiKeyCreator
    createdAt: DateTime!
    lastUsedAt: DateTime
    # Null for a key that never expires.
    expiresAt: DateTime
  }

  type ApiKeyConnection {
    items: [ApiKey!]!
    pageInfo: PageInfo!
  }

  # A new key and the plain key, returned only by createApiKey.
  type CreatedApiKey {
    apiKey: ApiKey!
    key: String!
  }

  input CreateApiKeyInput {
    name: String!
    # 1 to 365; null for a key that never expires.
    expiresInDays: Int
  }

  extend type Query {
    # The Active Organization's API Keys, newest first. Requires apiKey:read.
    apiKeys(first: Int, after: String): ApiKeyConnection!
  }

  extend type Mutation {
    # Requires apiKey:create. The key grants its creator's Permissions, never more.
    createApiKey(input: CreateApiKeyInput!): CreatedApiKey!
    # Requires apiKey:delete. False when no key with this id is in the Organization.
    revokeApiKey(id: ID!): Boolean!
  }
`;
