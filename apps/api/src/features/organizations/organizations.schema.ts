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

  extend type Query {
    organizations: [Organization!]!
    currentOrganization: Organization
    members: [OrganizationMember!]!
  }
`;
