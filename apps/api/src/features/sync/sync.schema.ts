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
  Rows older than a payload returned, for one of its lists. Load them with
  syncPullOlder.
  """
  type SyncOlder {
    """
    The SyncPullPayload field the older rows load into, such as todos or
    notes.
    """
    list: String!
    """
    Pass to syncPullOlder to load the next older rows of the list. It names
    its list and Organization, so another Organization cannot use it.
    """
    after: String!
  }

  """
  The changes after a cursor, oldest first. When resetRequired is true the
  client drops its local rows and pulls again without a cursor; cursor is null.
  A syncPullOlder page also has a null cursor: it holds rows, not changes.
  """
  type SyncPullPayload {
    todos: [Todo!]!
    notes: [Note!]!
    deleted: [SyncDeletion!]!
    cursor: String
    hasMore: Boolean!
    resetRequired: Boolean!
    """
    The lists with rows older than this payload returned. Only a first pull
    with a window, or a syncPullOlder page, names any.
    """
    older: [SyncOlder!]!
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
    """
    The body this edit started from. With it, the server merges the edit
    line by line into a body another device changed since; edits to the
    same lines are refused with CONFLICT. Without it, body replaces the body.
    """
    baseBody: String
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
    """
    With no cursor and a window, returns only the newest window rows of each
    list, newest first, and names the rest in older.
    """
    syncPull(cursor: String, first: Int, window: Int): SyncPullPayload!
    """
    The next older rows of one list, newest first, from a SyncOlder cursor.
    """
    syncPullOlder(after: String!, first: Int): SyncPullPayload!
  }

  extend type Mutation {
    syncPush(input: SyncPushInput!): SyncPushPayload!
  }
`;
