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
    # The caller's Permissions in the Active Organization, such as "todo:delete".
    organizationPermissions: [String!]!
    # The Organization Theme to apply: a theme name from @repo/theme. The default theme
    # when the Active Organization has none or its stored theme is no longer registered.
    organizationTheme: String!
  }

  extend type Mutation {
    # Members with the organization:update Permission. A registered theme name, or null to
    # follow the default theme. Returns the theme to apply.
    setOrganizationTheme(theme: String): String!
  }
`;
