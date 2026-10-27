export const assistantTypeDefs = /* GraphQL */ `
  type AssistantMessage {
    id: ID!
    conversationId: ID!
    role: String!
    content: String!
    createdAt: DateTime!
    toolActions: [AssistantToolAction!]!
  }

  type AssistantToolAction {
    tool: String!
    input: String
    output: String
  }

  type AssistantConversation {
    id: ID!
    title: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  enum SendMessageStatus {
    REPLIED
    AI_NOT_CONFIGURED
    FAILED
  }

  type SendMessagePayload {
    status: SendMessageStatus!
    conversationId: ID!
    reply: String
    toolActions: [AssistantToolAction!]!
    message: String
  }

  input SendMessageInput {
    conversationId: ID
    message: String!
  }

  type AssistantMessageDelta {
    conversationId: ID!
    delta: String!
  }

  type AssistantMessageConnection {
    items: [AssistantMessage!]!
    pageInfo: PageInfo!
  }

  type AssistantConversationConnection {
    items: [AssistantConversation!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    assistantMessages(conversationId: ID!, first: Int, after: String): AssistantMessageConnection!
    conversations(first: Int, after: String): AssistantConversationConnection!
  }

  extend type Mutation {
    sendMessage(input: SendMessageInput!): SendMessagePayload!
    deleteConversation(id: ID!): Boolean!
  }

  extend type Subscription {
    assistantMessageDelta: AssistantMessageDelta!
  }
`;
