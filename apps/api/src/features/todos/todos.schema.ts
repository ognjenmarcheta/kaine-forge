export const todosTypeDefs = /* GraphQL */ `
  scalar DateTime

  type Todo {
    id: ID!
    title: String!
    description: String
    completed: Boolean!
    organizationId: ID!
    attachments: [FileInfo!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateTodoInput {
    title: String!
    description: String
  }

  input UpdateTodoInput {
    title: String
    description: String
    completed: Boolean
  }

  extend type Query {
    todos(limit: Int, offset: Int): [Todo!]!
    todo(id: ID!): Todo
  }

  extend type Mutation {
    createTodo(input: CreateTodoInput!): Todo!
    updateTodo(id: ID!, input: UpdateTodoInput!): Todo!
    deleteTodo(id: ID!): Boolean!
    toggleTodo(id: ID!): Todo!
  }

  type TodoDeletedPayload {
    id: ID!
    organizationId: ID!
  }

  extend type Subscription {
    todoCreated: Todo!
    todoUpdated: Todo!
    todoDeleted: TodoDeletedPayload!
    todoToggled: Todo!
  }
`;
