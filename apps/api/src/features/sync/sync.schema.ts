export const syncTypeDefs = /* GraphQL */ `
  enum SyncEntity {
    TODO
    NOTE
  }

  type SyncDeletion {
    entity: SyncEntity!
    id: ID!
  }

  """
  The changes after a cursor, oldest first. When resetRequired is true the
  client drops its local rows and pulls again without a cursor; cursor is null.
  """
  type SyncPullPayload {
    todos: [Todo!]!
    notes: [Note!]!
    deleted: [SyncDeletion!]!
    cursor: String
    hasMore: Boolean!
    resetRequired: Boolean!
  }

  input SyncTodoCreate {
    id: ID!
    title: String!
    description: String
    noteId: ID
  }

  input SyncTodoUpdate {
    id: ID!
    title: String
    description: String
    completed: Boolean
  }

  input SyncNoteCreate {
    id: ID!
    title: String!
    body: String
  }

  input SyncNoteUpdate {
    id: ID!
    title: String
    body: String
  }

  input SyncDelete {
    id: ID!
  }

  input SyncMutationInput @oneOf {
    todoCreate: SyncTodoCreate
    todoUpdate: SyncTodoUpdate
    todoDelete: SyncDelete
    noteCreate: SyncNoteCreate
    noteUpdate: SyncNoteUpdate
    noteDelete: SyncDelete
  }

  input SyncPushInput {
    idempotencyKey: String!
    mutations: [SyncMutationInput!]!
  }

  enum SyncMutationStatus {
    APPLIED
    REJECTED
  }

  enum SyncRejectionCode {
    NOT_FOUND
    FORBIDDEN
    INVALID
    CONFLICT
    PLAN_LIMIT_REACHED
  }

  type SyncMutationResult {
    status: SyncMutationStatus!
    code: SyncRejectionCode
  }

  type SyncPushPayload {
    results: [SyncMutationResult!]!
  }

  extend type Query {
    syncPull(cursor: String, first: Int): SyncPullPayload!
  }

  extend type Mutation {
    syncPush(input: SyncPushInput!): SyncPushPayload!
  }
`;
