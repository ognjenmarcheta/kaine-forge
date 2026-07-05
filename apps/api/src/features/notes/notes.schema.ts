export const notesTypeDefs = /* GraphQL */ `
  type Note {
    id: ID!
    title: String!
    body: String
    organizationId: ID!
    todos: [Todo!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateNoteInput {
    title: String!
    body: String
  }

  input UpdateNoteInput {
    title: String
    body: String
  }

  type NoteDeletedPayload {
    id: ID!
    organizationId: ID!
  }

  extend type Query {
    notes(limit: Int, offset: Int): [Note!]!
    note(id: ID!): Note
  }

  extend type Mutation {
    createNote(input: CreateNoteInput!): Note!
    updateNote(id: ID!, input: UpdateNoteInput!): Note!
    deleteNote(id: ID!): Boolean!
    addTodoToNote(noteId: ID!, input: CreateTodoInput!): Todo!
  }

  extend type Subscription {
    noteCreated: Note!
    noteUpdated: Note!
    noteDeleted: NoteDeletedPayload!
  }
`;
