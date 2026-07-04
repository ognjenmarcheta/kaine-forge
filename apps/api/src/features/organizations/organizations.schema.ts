export const organizationsTypeDefs = /* GraphQL */ `
  type Organization {
    id: ID!
    name: String!
    slug: String!
    role: String!
  }

  type OrganizationMember {
    id: ID!
    userId: ID!
    email: String!
    name: String!
    role: String!
  }

  type OrganizationInvitation {
    id: ID!
    email: String!
    role: String!
    status: String!
    expiresAt: String!
  }

  extend type Query {
    organizations: [Organization!]!
    currentOrganization: Organization
    members: [OrganizationMember!]!
    invitations: [OrganizationInvitation!]!
  }
`;
