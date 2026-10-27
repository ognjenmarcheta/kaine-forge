export const baseTypeDefs = /* GraphQL */ `
  type Query {
    health: String!
  }

  type Mutation {
    _empty: Boolean
  }

  type Subscription {
    _empty: Boolean
  }

  """
  Where a page of a list ends. Pass endCursor as the list's after argument to
  read the next page; every list field returns a <Type>Connection with items
  and this pageInfo.
  """
  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }
`;
