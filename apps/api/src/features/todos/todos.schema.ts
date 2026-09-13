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

  input GenerateTodosInput {
    prompt: String!
  }

  enum GenerateTodosStatus {
    CREATED
    AI_NOT_CONFIGURED
    FAILED
  }

  type GenerateTodosPayload {
    status: GenerateTodosStatus!
    todos: [Todo!]!
    message: String
  }

  extend type Query {
    todos(limit: Int, offset: Int, search: String, completed: Boolean): [Todo!]!
    todo(id: ID!): Todo
  }

  extend type Mutation {
    createTodo(input: CreateTodoInput!): Todo!
    generateTodos(input: GenerateTodosInput!): GenerateTodosPayload!
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
